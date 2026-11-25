import { callWorker } from '@/workers/rpc';
import type { EngineContext } from '@/jobs/types';
import type { DetectResult, PageResult, Quad, ScanRequest, ScanResponse, Filter, PageFormat, Turns } from './types';

function createScanWorker(): Worker {
  return new Worker(new URL('../../workers/scan.worker.ts', import.meta.url), { type: 'module' });
}

async function call(req: ScanRequest, signal: AbortSignal, ctx?: Pick<EngineContext, 'onProgress'>): Promise<ScanResponse> {
  return callWorker<ScanRequest, ScanResponse>(createScanWorker, req, { signal, onProgress: ctx?.onProgress });
}

/** Suggests the page corners. Not a job: it runs when a photo is shown. */
export async function detectCorners(blob: Blob, signal: AbortSignal): Promise<DetectResult> {
  const r = await call({ type: 'detect', blob }, signal);
  if (r.kind !== 'detect') throw new Error('Unexpected scan response');
  return r;
}

/** One page, flattened and cleaned. The original blob is passed by reference, never transferred. */
export async function renderPage(
  blob: Blob,
  opts: { quad: Quad; turns: Turns; filter: Filter; format: PageFormat; maxSide: number },
  signal: AbortSignal,
  onProgress?: EngineContext['onProgress'],
): Promise<PageResult> {
  const r = await call({ type: 'page', blob, ...opts }, signal, onProgress ? { onProgress } : undefined);
  if (r.kind !== 'page') throw new Error('Unexpected scan response');
  return r;
}
