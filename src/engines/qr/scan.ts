// Reading QR codes from pixels. Pure decode steps plus image/video intake. Nothing leaves the page.
import jsQR from 'jsqr';
import { ToolError } from '@/lib/errors';

/** Images whose longest side is above this are also tried downscaled. */
export const SCAN_MAX_SIDE = 1600;
/** Longest side kept when an image is first read. Bounds memory for very large photos. */
export const SCAN_READ_CAP = 4096;

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** One jsQR pass: the pixels as they are, then inverted (light code on a dark background). */
export function decodePixels(p: Pixels): string | null {
  return jsQR(p.data, p.width, p.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Box-average downscale so the longest side is at most maxSide. Returns the input unchanged when it already fits. */
export function fitWithin(p: Pixels, maxSide: number): Pixels {
  const longest = Math.max(p.width, p.height);
  if (longest <= maxSide) return p;
  const k = maxSide / longest;
  const w = Math.max(1, Math.round(p.width * k));
  const h = Math.max(1, Math.round(p.height * k));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / k);
    const y1 = Math.min(p.height, Math.max(y0 + 1, Math.floor((y + 1) / k)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / k);
      const x1 = Math.min(p.width, Math.max(x0 + 1, Math.floor((x + 1) / k)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * p.width + sx) * 4;
          r += p.data[i]!;
          g += p.data[i + 1]!;
          b += p.data[i + 2]!;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** Full image first (as is, then inverted), then a downscaled copy when the image is larger than SCAN_MAX_SIDE. */
export function decodeRobust(p: Pixels): string | null {
  const direct = decodePixels(p);
  if (direct !== null) return direct;
  const small = fitWithin(p, SCAN_MAX_SIDE);
  return small === p ? null : decodePixels(small);
}

/** Draws a source into pixels, scaled so the longest side is at most maxSide. */
export function pixelsFromSource(src: CanvasImageSource, sw: number, sh: number, maxSide: number): Pixels {
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * k));
  const height = Math.max(1, Math.round(sh * k));
  const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ToolError('qr-canvas', 'This browser cannot read image pixels.', 'Try a different browser.');
  ctx.drawImage(src, 0, 0, width, height);
  const d = ctx.getImageData(0, 0, width, height);
  return { data: d.data, width, height };
}

/** Reads an image file, a pasted image or a screenshot. Orientation comes from EXIF. */
export async function pixelsFromBlob(blob: Blob): Promise<Pixels> {
  let bm: ImageBitmap;
  try {
    bm = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new ToolError('qr-image', 'This file could not be read as an image.', 'Choose a PNG, JPEG, WebP or GIF image.');
  }
  try {
    return pixelsFromSource(bm, bm.width, bm.height, SCAN_READ_CAP);
  } finally {
    bm.close();
  }
}
