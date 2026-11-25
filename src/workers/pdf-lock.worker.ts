import { serve } from '@/workers/rpc';
import { inspectPdf, lockPdf, unlockPdf } from '@/engines/pdf-lock/ops';
import type { PdfLockRequest, PdfLockResponse } from '@/engines/pdf-lock/client';

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

// One worker per job. Cancel terminates it, so no cooperative stop is needed.
// Errors thrown as ToolError keep their code and next step through serve().
serve<PdfLockRequest, PdfLockResponse>(async (req, onProgress) => {
  onProgress({ stage: 'inspecting' });
  const bytes = await bytesOf(req.blob);

  if (req.type === 'inspect') {
    return { result: { kind: 'inspect', inspection: await inspectPdf(bytes) } };
  }

  onProgress({ stage: 'processing' });
  if (req.type === 'unlock') {
    const out = await unlockPdf(bytes, req.password);
    return { result: { kind: 'unlock', bytes: out.bytes, opensWithoutPassword: out.opensWithoutPassword }, transfer: [out.bytes.buffer as ArrayBuffer] };
  }

  const out = await lockPdf(bytes, req.options);
  return { result: { kind: 'lock', bytes: out }, transfer: [out.buffer as ArrayBuffer] };
});
