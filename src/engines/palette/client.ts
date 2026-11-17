import { callWorker } from '@/workers/rpc';
import type { PaletteRequest, PaletteResponse, PaletteSize } from './types';

function createPaletteWorker(): Worker {
  return new Worker(new URL('../../workers/palette.worker.ts', import.meta.url), { type: 'module' });
}

/** Decodes and analyses one picture in a worker. The original blob is passed by reference, never transferred. */
export function analyzeImage(blob: Blob, k: PaletteSize, signal: AbortSignal): Promise<PaletteResponse> {
  return callWorker<PaletteRequest, PaletteResponse>(createPaletteWorker, { type: 'analyze', blob, k }, { signal });
}
