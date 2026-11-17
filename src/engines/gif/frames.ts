// Worker side: turns the inputs (a video, or stills and GIFs) into a stream of composed source frames.
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { ToolError } from '@/lib/errors';
import { SNIFF_BYTES, sniffImageMime } from '@/engines/image/sniff';
import { fitSize, type Size } from './geometry';
import { decodeGifFrames, type RgbaFrame } from './gifdecode';
import { GIF_LIMITS, type FrameSpec, type StillItem } from './types';

/** One source frame. `canvas` is valid until the next yield; read it, do not keep it. */
export type Source = {
  id: string;
  ms: number;
  canvas: OffscreenCanvas;
  /** Size the export works at (memory cap applied, no preview scaling). */
  fullWidth: number;
  fullHeight: number;
  /** True when the memory cap made this frame smaller than its original. */
  scaled: boolean;
};

const unreadable = () =>
  new ToolError('unreadable', 'This video could not be read. It may be damaged or use a format this browser cannot open.', 'Try an MP4 (H.264) or WebM file, or export the video again.');
const decodeFailed = (name: string) =>
  new ToolError('decode-failed', `${name} could not be decoded. It may be damaged.`, 'Open it in an image viewer to check it, or remove it from the list.');

function dims(w: number, h: number, maxEdge: number) {
  const full = fitSize(w, h, Infinity, GIF_LIMITS.maxFramePixels);
  const out = fitSize(w, h, maxEdge, GIF_LIMITS.maxFramePixels);
  return { full, out, scaled: full.w !== w || full.h !== h };
}

function sourceOf(id: string, ms: number, canvas: OffscreenCanvas, full: Size, scaled: boolean): Source {
  return { id, ms, canvas, fullWidth: full.w, fullHeight: full.h, scaled };
}

/** Copies an RGBA frame onto a canvas at `out` size (scaled only when needed). */
function fromRgba(f: RgbaFrame, out: Size): OffscreenCanvas {
  const src = new OffscreenCanvas(f.width, f.height);
  src.getContext('2d')!.putImageData(new ImageData(f.data as Uint8ClampedArray<ArrayBuffer>, f.width, f.height), 0, 0);
  if (out.w === f.width && out.h === f.height) return src;
  const c = new OffscreenCanvas(out.w, out.h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.w, out.h);
  return c;
}

async function* videoFrames(spec: Extract<FrameSpec, { kind: 'video' }>, maxEdge: number): AsyncGenerator<Source> {
  const input = new Input({ source: new BlobSource(spec.blob), formats: ALL_FORMATS });
  try {
    let track;
    let duration;
    try {
      track = await input.getPrimaryVideoTrack();
      duration = await input.computeDuration();
    } catch (e) {
      if (e instanceof ToolError) throw e;
      throw unreadable();
    }
    if (!track) throw new ToolError('no-video-track', 'This file has no video track, so there are no frames to make a GIF from.', 'Choose a video file, or add images instead.');
    if (!(await track.canDecode())) {
      throw new ToolError('codec', `This browser cannot decode the video codec${track.codec ? ` (${track.codec})` : ''}.`, 'Try an MP4 (H.264) or WebM (VP8/VP9) file.');
    }
    const start = spec.startSec;
    const end = Math.min(spec.endSec ?? duration, duration);
    if (!(start >= 0) || !(end > start) || start >= duration) {
      throw new ToolError('bad-range', 'The end time must be after the start time, and inside the video.', 'Adjust the start and end times.');
    }
    const n = Math.round((end - start) * spec.fps);
    if (n < 1) throw new ToolError('no-frames', 'The range is shorter than one frame at this frame rate.', 'Make the range longer, or raise the frame rate.');
    if (n > GIF_LIMITS.maxFrames) {
      throw new ToolError('too-many-frames', `This selection would make ${n} frames. The limit is ${GIF_LIMITS.maxFrames}.`, 'Lower the frame rate, or shorten the trim.');
    }
    const { full, out, scaled } = dims(track.displayWidth, track.displayHeight, maxEdge);
    const sink = new CanvasSink(track, { width: out.w, height: out.h, fit: 'fill' });
    const ms = Math.round(1000 / spec.fps);
    const at = (i: number) => start + i / spec.fps;
    // Sample-and-hold: each output frame shows the latest decoded picture at or before its time.
    let k = 0;
    let last: OffscreenCanvas | null = null;
    try {
      for await (const wc of sink.canvases(start, end)) {
        const cur = copyCanvas(wc.canvas, out);
        while (k < n && at(k) < wc.timestamp) {
          yield sourceOf(`v${k}`, ms, last ?? cur, full, scaled);
          k++;
        }
        last = cur;
      }
    } catch (e) {
      if (e instanceof ToolError) throw e;
      throw unreadable();
    }
    if (!last) throw new ToolError('no-frames', 'No video frames were found in that range.', 'Check the start and end times.');
    while (k < n) {
      yield sourceOf(`v${k}`, ms, last, full, scaled);
      k++;
    }
  } finally {
    input.dispose();
  }
}

function copyCanvas(src: OffscreenCanvas | HTMLCanvasElement | ImageBitmap, out: Size): OffscreenCanvas {
  const c = new OffscreenCanvas(out.w, out.h);
  c.getContext('2d')!.drawImage(src as CanvasImageSource, 0, 0, out.w, out.h);
  return c;
}

async function* stillFrames(items: readonly StillItem[], maxEdge: number): AsyncGenerator<Source> {
  let count = 0;
  const bump = () => {
    if (++count > GIF_LIMITS.maxFrames) {
      throw new ToolError('too-many-frames', `These images make more than ${GIF_LIMITS.maxFrames} frames.`, 'Remove some images, or split them into several GIFs.');
    }
  };
  for (const item of items) {
    const mime = sniffImageMime(new Uint8Array(await item.blob.slice(0, SNIFF_BYTES).arrayBuffer()));
    if (mime === 'image/gif') {
      let k = 0;
      for await (const f of decodeGifFrames(item.blob)) {
        bump();
        const { full, out, scaled } = dims(f.width, f.height, maxEdge);
        yield sourceOf(`${item.id}#${k++}`, f.ms, fromRgba(f, out), full, scaled);
      }
    } else if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(item.blob);
      } catch {
        throw decodeFailed(item.name);
      }
      const { full, out, scaled } = dims(bmp.width, bmp.height, maxEdge);
      const c = new OffscreenCanvas(out.w, out.h);
      c.getContext('2d')!.drawImage(bmp, 0, 0, out.w, out.h);
      bmp.close();
      bump();
      yield sourceOf(`${item.id}#0`, GIF_LIMITS.stillMs, c, full, scaled);
    } else {
      throw new ToolError('unsupported-format', `${item.name} is not a GIF, PNG, JPEG or WebP image.`, 'Remove it from the list, or convert it to one of those formats.');
    }
  }
  if (count === 0) throw new ToolError('no-frames', 'There are no frames to make a GIF from.', 'Add images, a GIF or a video.');
}

/** Every source frame for a spec, scaled so its longest edge is at most maxEdge (Infinity = full size, capped by memory). */
export function frameSource(spec: FrameSpec, maxEdge: number): AsyncGenerator<Source> {
  return spec.kind === 'video' ? videoFrames(spec, maxEdge) : stillFrames(spec.items, maxEdge);
}
