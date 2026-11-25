import { ToolError } from '@/lib/errors';
import { applyHomography, homographyFrom } from './homography';
import type { Pt, Raster, Turns } from './types';

const MIN_SIDE = 4;

/** Output size from the average opposite edge lengths (pixels in the photo), scaled so the longest side is at most maxSide. */
export function outputSize(q: readonly Pt[], maxSide: number): { width: number; height: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (d(q[0]!, q[1]!) + d(q[3]!, q[2]!)) / 2;
  const h = (d(q[0]!, q[3]!) + d(q[1]!, q[2]!)) / 2;
  if (!(w >= MIN_SIDE && h >= MIN_SIDE)) throw new ToolError('bad-corners', 'The page corners are too close together.', 'Spread the corners out to the edges of the paper.');
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** Perspective-warps the quadrilateral (pixel coordinates in src) into an upright rectangle. Bilinear sampling, edges clamped. */
export function warpQuad(src: Raster, q: readonly Pt[], maxSide: number): Raster {
  const { width: W, height: H } = outputSize(q, maxSide);
  // Maps output pixel space to photo pixels: rectangle corners to the quad corners in the same order.
  const M = homographyFrom(
    [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: H },
      { x: 0, y: H },
    ],
    q,
  );
  const out = new Uint8ClampedArray(W * H * 4);
  const { width: w, height: h, data } = src;
  for (let oy = 0; oy < H; oy++) {
    for (let ox = 0; ox < W; ox++) {
      const p = applyHomography(M, ox + 0.5, oy + 0.5);
      const fx = Math.min(w - 1, Math.max(0, p.x - 0.5));
      const fy = Math.min(h - 1, Math.max(0, p.y - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const i00 = (y0 * w + x0) * 4;
      const i10 = (y0 * w + x1) * 4;
      const i01 = (y1 * w + x0) * 4;
      const i11 = (y1 * w + x1) * 4;
      const o = (oy * W + ox) * 4;
      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c]! + (data[i10 + c]! - data[i00 + c]!) * tx;
        const bot = data[i01 + c]! + (data[i11 + c]! - data[i01 + c]!) * tx;
        out[o + c] = top + (bot - top) * ty + 0.5;
      }
      out[o + 3] = 255;
    }
  }
  return { width: W, height: H, data: out };
}

/** Rotates clockwise by turns x 90 degrees. Returns the input itself for 0 turns. */
export function rotate(r: Raster, turns: Turns): Raster {
  let cur = r;
  for (let t = 0; t < turns; t++) cur = rotate90cw(cur);
  return cur;
}

function rotate90cw(r: Raster): Raster {
  const { width: w, height: h, data } = r;
  const out = new Uint8ClampedArray(data.length);
  // New width is h. Source (x, y) lands at (h - 1 - y, x).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (x * h + (h - 1 - y)) * 4;
      out[d] = data[s]!;
      out[d + 1] = data[s + 1]!;
      out[d + 2] = data[s + 2]!;
      out[d + 3] = data[s + 3]!;
    }
  }
  return { width: h, height: w, data: out };
}
