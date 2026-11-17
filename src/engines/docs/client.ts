import { callWorker } from '@/workers/rpc';
import type { DocRequest, DocResult } from './convert';

/** Runs one conversion in its own worker. Cancel terminates the worker. */
export function convertInWorker(req: DocRequest, opts: { signal: AbortSignal; onProgress?: (p: import('@/jobs/types').JobProgress) => void }): Promise<DocResult> {
  return callWorker<DocRequest, DocResult>(() => new Worker(new URL('../../workers/docs.worker.ts', import.meta.url), { type: 'module' }), req, opts);
}
