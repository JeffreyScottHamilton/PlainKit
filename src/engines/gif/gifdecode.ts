// GIF frame decoding. Uses the browser's ImageDecoder (WebCodecs) when it can read GIF, otherwise gifuct-js (MIT).
import { decompressFrames, parseGIF, type ParsedFrame } from 'gifuct-js';
import { ToolError } from '@/lib/errors';
import { sniffImageMime } from '@/engines/image/sniff';

export type RgbaFrame = { width: number; height: number; ms: number; data: Uint8ClampedArray };

const DEFAULT_MS = 100;

/**
 * Composes GIF frames onto the logical screen, honouring disposal methods (2 = clear to transparent, 3 = restore the
 * previous screen). Yields each composed frame as RGBA. Pure, so it is tested without a browser.
 */
export function* composeGif(width: number, height: number, frames: readonly ParsedFrame[]): Generator<RgbaFrame> {
  const screen = new Uint8ClampedArray(width * height * 4);
  let saved: Uint8ClampedArray | null = null;
  let prev: ParsedFrame | null = null;
  for (const f of frames) {
    if (prev) {
      if (prev.disposalType === 2) {
        const { top, left, width: pw, height: ph } = prev.dims;
        for (let y = 0; y < ph; y++) {
          const row = ((top + y) * width + left) * 4;
          if (row < 0 || top + y >= height) continue;
          screen.fill(0, row, row + Math.min(pw, width - left) * 4);
        }
      } else if (prev.disposalType === 3 && saved) screen.set(saved);
    }
    saved = f.disposalType === 3 ? screen.slice() : null;
    const { top, left, width: fw, height: fh } = f.dims;
    for (let y = 0; y < fh; y++) {
      const ty = top + y;
      if (ty < 0 || ty >= height) continue;
      for (let x = 0; x < fw; x++) {
        const tx = left + x;
        const s = (y * fw + x) * 4;
        if (tx < 0 || tx >= width || f.patch[s + 3] === 0) continue;
        const d = (ty * width + tx) * 4;
        screen[d] = f.patch[s]!;
        screen[d + 1] = f.patch[s + 1]!;
        screen[d + 2] = f.patch[s + 2]!;
        screen[d + 3] = 255;
      }
    }
    yield { width, height, ms: f.delay || DEFAULT_MS, data: screen.slice() };
    prev = f;
  }
}

/** Frames of a GIF buffer with gifuct-js, composed lazily. Parse errors are thrown before the first frame. */
export function decodeGifWithGifuct(buf: ArrayBuffer): Generator<RgbaFrame> {
  if (sniffImageMime(new Uint8Array(buf, 0, Math.min(buf.byteLength, 1024))) !== 'image/gif') {
    throw new ToolError('decode-failed', 'This file is not a GIF.', 'Choose a GIF, or another image type.');
  }
  let frames: ParsedFrame[];
  let width: number;
  let height: number;
  try {
    const gif = parseGIF(buf);
    width = gif.lsd.width;
    height = gif.lsd.height;
    frames = decompressFrames(gif, true);
  } catch {
    throw new ToolError('decode-failed', 'This GIF could not be decoded. It may be damaged.', 'Open it in a browser to check it, or use another file.');
  }
  if (!width || !height) throw new ToolError('decode-failed', 'This GIF has no valid size.', 'Use another file.');
  return composeGif(width, height, frames);
}

/** Frames of an animated GIF from the browser decoder, in order. Full composed frames, delays in ms. */
async function* decodeWithImageDecoder(blob: Blob): AsyncGenerator<RgbaFrame> {
  const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
  try {
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack?.frameCount ?? 0;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      try {
        const w = image.displayWidth;
        const h = image.displayHeight;
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;
        yield { width: w, height: h, ms: image.duration ? image.duration / 1000 : DEFAULT_MS, data };
      } finally {
        image.close();
      }
    }
  } finally {
    dec.close();
  }
}

/**
 * Frames of an animated GIF. Native ImageDecoder when the browser can read GIF; gifuct-js otherwise.
 * Any failure is a ToolError the user can act on.
 */
export async function* decodeGifFrames(blob: Blob): AsyncGenerator<RgbaFrame> {
  const native = typeof ImageDecoder !== 'undefined' && (await ImageDecoder.isTypeSupported('image/gif').catch(() => false));
  if (native) {
    try {
      for await (const f of decodeWithImageDecoder(blob)) yield f;
    } catch {
      throw new ToolError('decode-failed', 'This GIF could not be decoded. It may be damaged.', 'Open it in a browser to check it, or use another file.');
    }
    return;
  }
  yield* decodeGifWithGifuct(await blob.arrayBuffer());
}
