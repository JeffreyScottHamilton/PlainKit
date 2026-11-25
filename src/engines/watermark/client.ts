import { callWorker } from '@/workers/rpc';
import type { EngineContext } from '@/jobs/types';
import type { RenderResult, WatermarkRequest, WatermarkSettings } from './types';

function createWatermarkWorker(): Worker {
  return new Worker(new URL('../../workers/watermark.worker.ts', import.meta.url), { type: 'module' });
}

/** Blobs go by structured clone, never transferred, so the session assets stay intact. */
export function watermarkImage(blob: Blob, logo: Blob | null, settings: WatermarkSettings, ctx: EngineContext): Promise<RenderResult> {
  return callWorker<WatermarkRequest, RenderResult>(
    createWatermarkWorker,
    { type: 'watermark', blob, logo, settings },
    { signal: ctx.signal, onProgress: ctx.onProgress },
  );
}
