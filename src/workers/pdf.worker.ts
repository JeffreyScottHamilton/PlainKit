import { serve } from '@/workers/rpc';
import { buildPdf } from '@/engines/pdf/export';
import type { WorkerRequest, WorkerResponse } from '@/engines/pdf/types';

// Export only. The worker is created per job and terminated on cancel.
serve<WorkerRequest, WorkerResponse>(async (req, onProgress) => {
  onProgress({ stage: 'processing', message: 'Reading pages' });
  const sources = new Map<string, Uint8Array>();
  for (const s of req.sources) sources.set(s.id, new Uint8Array(await s.blob.arrayBuffer()));
  const results = [];
  for (let i = 0; i < req.parts.length; i++) {
    onProgress({ stage: 'exporting', message: req.parts.length > 1 ? `Writing file ${i + 1} of ${req.parts.length}` : undefined });
    results.push(await buildPdf(req.parts[i]!, sources, req.numbering));
  }
  return { result: results, transfer: results.map((r) => r.bytes.buffer as ArrayBuffer) };
});
