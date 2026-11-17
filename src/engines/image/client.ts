import { callWorker } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import type { EngineContext } from '@/jobs/types';
import type { EncodeOptions, EncodeResult, InspectResult, WorkerRequest, WorkerResponse } from './types';

function createImageWorker(): Worker {
  return new Worker(new URL('../../workers/image.worker.ts', import.meta.url), { type: 'module' });
}

const unexpected = () => new ToolError('unexpected', 'The image worker returned an unexpected answer.', 'Try again.');

/** Original blob is passed by reference (structured clone), never transferred, so the session asset stays intact. */
export async function encodeImage(blob: Blob, options: EncodeOptions, ctx: EngineContext): Promise<EncodeResult> {
  const res = await callWorker<WorkerRequest, WorkerResponse>(createImageWorker, { type: 'encode', blob, options }, { signal: ctx.signal, onProgress: ctx.onProgress });
  if (res.kind !== 'encode') throw unexpected();
  return res.value;
}

export async function inspectImage(blob: Blob): Promise<InspectResult> {
  const res = await callWorker<WorkerRequest, WorkerResponse>(createImageWorker, { type: 'inspect', blob }, { signal: new AbortController().signal });
  if (res.kind !== 'inspect') throw unexpected();
  return res.value;
}

import type { ExtraMime } from './extra';
import type { ExtraRequest, ExtraResponse } from '@/workers/image-extra.worker';

/** Writes GIF, BMP, ICO, TIFF or AVIF from a lossless PNG produced by encodeImage. */
export function encodeExtra(png: Blob, target: ExtraMime, opts: { quality?: number; icoSize?: number; background?: string }, ctx: EngineContext): Promise<ExtraResponse> {
  return callWorker<ExtraRequest, ExtraResponse>(() => new Worker(new URL('../../workers/image-extra.worker.ts', import.meta.url), { type: 'module' }), { png, target, ...opts }, { signal: ctx.signal, onProgress: ctx.onProgress });
}

/**
 * SVG is drawn by the browser's own image renderer on the main thread (workers cannot decode SVG). Loaded as an image,
 * an SVG cannot run scripts or load outside files. Returns a PNG at the SVG's own size, or `fallbackWidth` wide when it has none.
 */
export async function rasterizeSvg(svg: Blob, fallbackWidth = 1024): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new ToolError('decode-failed', 'This SVG could not be drawn. It may be damaged.', 'Open it in a browser tab to check it.'));
      img.src = url;
    });
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (!w || !h) {
      w = fallbackWidth;
      h = fallbackWidth;
    }
    const max = 8192;
    const s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    const png = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (!png) throw new ToolError('decode-failed', 'This SVG could not be drawn.', 'Try a smaller SVG.');
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}
