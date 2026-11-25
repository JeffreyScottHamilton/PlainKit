import { serve } from '@/workers/rpc';
import { signPdf } from './export';
import type { WorkerRequest, WorkerResponse } from './types';

// Export only. The worker is created per job and terminated on cancel.
serve<WorkerRequest, WorkerResponse>(async (req, onProgress) => {
  onProgress({ stage: 'processing', message: 'Placing items' });
  const result = await signPdf(new Uint8Array(await req.source.arrayBuffer()), req.items);
  return { result, transfer: [result.bytes.buffer as ArrayBuffer] };
});
