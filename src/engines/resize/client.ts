import { callWorker } from '@/workers/rpc';
import type { EngineContext } from '@/jobs/types';
import type { RenderResult, RenderSettings, ResizeRequest } from './types';

function createResizeWorker(): Worker {
  return new Worker(new URL('../../workers/resize.worker.ts', import.meta.url), { type: 'module' });
}

/** The original blob is passed by reference (structured clone), never transferred, so the session asset stays intact. */
export function resizeImage(blob: Blob, settings: RenderSettings, ctx: EngineContext): Promise<RenderResult> {
  return callWorker<ResizeRequest, RenderResult>(createResizeWorker, { type: 'resize', blob, settings }, { signal: ctx.signal, onProgress: ctx.onProgress });
}
