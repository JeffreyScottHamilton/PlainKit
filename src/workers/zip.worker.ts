import { unzipSync, zipSync, type Zippable } from 'fflate';
import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { assertWithinCap } from '@/engines/zip/guard';
import { mimeFor } from '@/engines/zip/mime';
import { corrupt, readCentralDirectory } from '@/engines/zip/read';
import type { ZipRequest, ZipResponse } from '@/engines/zip/types';

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

// One worker per job. Cancel terminates it, so no cooperative stop is needed.
serve<ZipRequest, ZipResponse>(async (req, onProgress) => {
  if (req.type === 'list') {
    const entries = readCentralDirectory(await bytesOf(req.blob));
    const totalSize = entries.reduce((s, e) => s + e.size, 0);
    assertWithinCap(totalSize, 'The archive');
    return { result: { kind: 'list', entries: entries.filter((e) => e.path !== ''), totalSize } };
  }

  if (req.type === 'pack') {
    const parts: Zippable = {};
    for (const [i, f] of req.files.entries()) {
      parts[f.path] = [await bytesOf(f.blob), { level: f.level }];
      onProgress({ stage: 'processing', fraction: (i + 1) / req.files.length });
    }
    const bytes = zipSync(parts);
    return { result: { kind: 'pack', bytes }, transfer: [bytes.buffer] };
  }

  // extract: re-read the central directory here; never trust the UI's view of the archive.
  const bytes = await bytesOf(req.blob);
  const want = new Set(req.names);
  const picked = readCentralDirectory(bytes).filter((e) => want.has(e.name) && !e.isDir && e.path !== '');
  const blocked = picked.find((e) => e.unsupported);
  if (blocked) {
    throw blocked.unsupported === 'encrypted'
      ? new ToolError('zip-encrypted', `${blocked.path} is encrypted. Encrypted entries are not supported.`, 'Deselect it, then extract the rest.')
      : new ToolError('zip-method', `${blocked.path} uses a compression method this tool cannot read.`, 'Deselect it, then extract the rest.');
  }
  assertWithinCap(
    picked.reduce((s, e) => s + e.size, 0),
    'The selected files',
  );
  const names = new Set(picked.map((e) => e.name));
  let data: Record<string, Uint8Array>;
  try {
    data = unzipSync(bytes, { filter: (f) => names.has(f.name) });
  } catch {
    throw corrupt();
  }
  const files = picked.map((e) => {
    const got = data[e.name];
    if (!got || got.length !== e.size) throw corrupt();
    return { path: e.path, mime: mimeFor(e.path), bytes: got };
  });
  return { result: { kind: 'extract', files }, transfer: files.map((f) => f.bytes.buffer as ArrayBuffer) };
});
