import { serve } from '@/workers/rpc';
import { buildPdf } from '@/engines/pdf/export';
import type { WorkerRequest, WorkerResponse } from '@/engines/pdf/types';

// Export only. The worker is created per job and terminated on cancel.
serve<WorkerRequest, WorkerResponse>(async (req, onProgress) => {
  onProgress({ stage: 'processing', message: 'Reading pages' });
  const sources = new Map<string, Uint8Array>();
  for (const s of req.sources) sources.set(s.id, new Uint8Array(await s.blob.arrayBuffer()));
  onProgress({ stage: 'exporting' });
  const result = await buildPdf(req.pages, sources);
  return { result, transfer: [result.bytes.buffer as ArrayBuffer] };
});
