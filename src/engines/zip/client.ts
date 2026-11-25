import { ToolError } from '@/lib/errors';
import type { JobProgress } from '@/jobs/types';
import { callWorker } from '@/workers/rpc';
import { assertWithinCap } from './guard';
import { isAlreadyCompressed, levelFor } from './policy';
import { baseName, sanitizePath, uniquePaths } from './path';
import type { PackFile, ZipEntry, ZipLevel, ZipRequest, ZipResponse } from './types';

const create = () => new Worker(new URL('../../workers/zip.worker.ts', import.meta.url), { type: 'module' });
const unexpected = () => new ToolError('unexpected', 'The ZIP worker sent an unexpected reply.', 'Try again.');

type Ctl = { signal: AbortSignal; onProgress?: (p: JobProgress) => void };

/** Builds the archive. Paths are sanitized and made unique here; the worker only zips. */
export async function packZip(inputs: { name: string; blob: Blob }[], mode: ZipLevel, ctl: Ctl): Promise<{ bytes: Uint8Array; storedCount: number }> {
  assertWithinCap(
    inputs.reduce((s, f) => s + f.blob.size, 0),
    'The selected files',
  );
  const paths = uniquePaths(inputs.map((f) => sanitizePath(f.name) || 'file'));
  const files: PackFile[] = inputs.map((f, i) => {
    const path = paths[i] ?? 'file';
    return { path, level: levelFor(path, mode), blob: f.blob };
  });
  const storedCount = mode === 'store' ? 0 : files.filter((f) => f.level === 0 && isAlreadyCompressed(f.path)).length;
  const res = await callWorker<ZipRequest, ZipResponse>(create, { type: 'pack', files }, ctl);
  if (res.kind !== 'pack') throw unexpected();
  return { bytes: res.bytes, storedCount };
}

/** Lists entries from the central directory only. Refuses archives whose declared total is over the cap. */
export async function listZip(blob: Blob, ctl: Ctl): Promise<{ entries: ZipEntry[]; totalSize: number }> {
  const res = await callWorker<ZipRequest, ZipResponse>(create, { type: 'list', blob }, ctl);
  if (res.kind !== 'list') throw unexpected();
  return { entries: res.entries, totalSize: res.totalSize };
}

/** Extracts the named entries (raw names from listZip). Output paths are sanitized by the worker. */
export async function extractZip(blob: Blob, names: string[], ctl: Ctl): Promise<{ name: string; mime: string; blob: Blob }[]> {
  const res = await callWorker<ZipRequest, ZipResponse>(create, { type: 'extract', blob, names }, ctl);
  if (res.kind !== 'extract') throw unexpected();
  return res.files.map((f) => ({ name: baseName(f.path), mime: f.mime, blob: new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.mime }) }));
}
