import { serve } from '@/workers/rpc';
import { encodeBlob, inspectBlob } from '@/engines/image/pipeline';
import type { WorkerRequest, WorkerResponse } from '@/engines/image/types';

// Heavy image work only. The worker is created per job and terminated on cancel.
serve<WorkerRequest, WorkerResponse>(async (req, onProgress) => {
  if (req.type === 'encode') return { result: { kind: 'encode', value: await encodeBlob(req.blob, req.options, onProgress) } };
  return { result: { kind: 'inspect', value: await inspectBlob(req.blob) } };
});
