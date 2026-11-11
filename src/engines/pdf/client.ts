import { callWorker } from '@/workers/rpc';
import type { EngineContext } from '@/jobs/types';
import type { ExportResult } from './export';
import type { PageRef } from './model';
import type { WorkerRequest, WorkerResponse } from './types';

function createPdfWorker(): Worker {
  return new Worker(new URL('../../workers/pdf.worker.ts', import.meta.url), { type: 'module' });
}

/** Runs the export in a worker; aborting the job terminates the worker (real cancellation). */
export function exportPages(pages: PageRef[], sources: { id: string; blob: Blob }[], ctx: EngineContext): Promise<ExportResult> {
  return callWorker<WorkerRequest, WorkerResponse>(createPdfWorker, { type: 'export', pages, sources }, { signal: ctx.signal, onProgress: ctx.onProgress });
}
