// Worker side: probe (preview frames) and export (encoded GIF bytes). Runs inside gif.worker.ts only.
import { ToolError } from '@/lib/errors';
import type { JobProgress } from '@/jobs/types';
import { sniffImageMime } from '@/engines/image/sniff';
import { cropRect, outputSize, type Rect, type Size } from './geometry';
import { frameSource } from './frames';
import { renderInto } from './render';
import { quantizeRgba, writeGif, type IndexedFrame } from './write';
import { GIF_LIMITS, type Entry, type ExportResult, type FrameSpec, type GifOptions, type ProbeResult, type ProbedFrame } from './types';

const SCALED_WARNING = `Frames larger than ${GIF_LIMITS.maxFramePixels.toLocaleString('en-US')} pixels were scaled down to fit the memory limit.`;

export async function probeFrames(spec: FrameSpec, onProgress: (p: JobProgress) => void): Promise<ProbeResult> {
  const frames: ProbedFrame[] = [];
  let W = 0;
  let H = 0;
  let fullW = 0;
  let fullH = 0;
  let scaled = false;
  try {
    for await (const src of frameSource(spec, GIF_LIMITS.previewMaxEdge)) {
      if (!W) {
        W = src.canvas.width;
        H = src.canvas.height;
        fullW = src.fullWidth;
        fullH = src.fullHeight;
      }
      scaled ||= src.scaled;
      const c = new OffscreenCanvas(W, H);
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      renderInto(ctx, src.canvas, { w: W, h: H }, { x: 0, y: 0, w: W, h: H }, W, H);
      frames.push({ id: src.id, ms: src.ms, bitmap: c.transferToImageBitmap() });
      onProgress({ stage: 'processing', message: `${frames.length} frames read` });
    }
  } catch (e) {
    frames.forEach((f) => f.bitmap.close());
    throw e;
  }
  return { kind: 'probe', frames, width: W, height: H, fullWidth: fullW, fullHeight: fullH, warnings: scaled ? [SCALED_WARNING] : [] };
}

export async function exportFrames(spec: FrameSpec, entries: readonly Entry[], options: GifOptions, onProgress: (p: JobProgress) => void): Promise<ExportResult> {
  if (entries.length === 0) throw new ToolError('no-frames', 'There are no frames left to export.', 'Restore a removed frame, or add images.');
  const wanted = new Set(entries.map((e) => e.id));
  // Each wanted frame is quantized once, at output size, then the file is written in play order.
  const store = new Map<string, IndexedFrame>();
  let layout: { W: number; H: number; rect: Rect; out: Size } | null = null;
  let scaled = false;
  for await (const src of frameSource(spec, Infinity)) {
    if (!layout) {
      const W = src.canvas.width;
      const H = src.canvas.height;
      const rect = cropRect(W, H, options.crop);
      const out = outputSize(rect.w, rect.h, options.width);
      if (out.w * out.h * entries.length > GIF_LIMITS.maxExportPixels) {
        throw new ToolError(
          'export-too-large',
          `${entries.length} frames at ${out.w}×${out.h} is more than the memory limit allows.`,
          'Lower the width, crop the frame, or remove some frames.',
        );
      }
      layout = { W, H, rect, out };
    }
    scaled ||= src.scaled;
    if (!wanted.has(src.id) || store.has(src.id)) continue;
    const { W, H, rect, out } = layout;
    const c = new OffscreenCanvas(out.w, out.h);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    renderInto(ctx, src.canvas, { w: W, h: H }, rect, out.w, out.h);
    const q = quantizeRgba(ctx.getImageData(0, 0, out.w, out.h).data, options.colors);
    store.set(src.id, { ...q, width: out.w, height: out.h, ms: 0 });
    onProgress({ stage: 'processing', fraction: store.size / wanted.size });
  }
  if (!layout) throw new ToolError('no-frames', 'There are no frames to make a GIF from.', 'Add images, a GIF or a video.');
  for (const e of entries) {
    if (!store.has(e.id)) throw new ToolError('frame-missing', 'A frame in the list is no longer in the source.', 'Read the frames again, or remove the missing frame.');
  }
  onProgress({ stage: 'exporting' });
  const frames = entries.map((e) => ({ ...store.get(e.id)!, ms: e.ms }));
  const bytes = writeGif(frames, options.loop);
  if (sniffImageMime(bytes) !== 'image/gif') throw new ToolError('encode', 'The GIF did not come out as a GIF.', 'Try again with fewer frames.');
  return {
    kind: 'export',
    bytes,
    width: layout.out.w,
    height: layout.out.h,
    frames: entries.length,
    warnings: scaled ? [SCALED_WARNING] : [],
  };
}
