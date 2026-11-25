import { callWorker } from '@/workers/rpc';
import type { EngineContext } from '@/jobs/types';
import type { ExportResult, Item, WorkerRequest, WorkerResponse } from './types';

function createSignWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

/** Runs the export in a worker; aborting the job terminates the worker. The source Blob is cloned, not moved. */
export function signInWorker(source: Blob, items: Item[], ctx: EngineContext): Promise<ExportResult> {
  return callWorker<WorkerRequest, WorkerResponse>(createSignWorker, { type: 'export', source, items }, { signal: ctx.signal, onProgress: ctx.onProgress });
}
