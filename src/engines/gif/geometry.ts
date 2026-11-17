// Pure size and crop math shared by the worker (export) and the page (preview, estimates). No browser APIs.
import type { Crop } from './types';

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Scales w×h down (never up) so the longest edge fits maxEdge and the area fits maxPixels. */
export function fitSize(w: number, h: number, maxEdge = Infinity, maxPixels = Infinity): Size {
  const s = Math.min(1, maxEdge / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
  // Floor, not round: rounding up could push the area past maxPixels.
  return { w: Math.max(1, Math.floor(w * s)), h: Math.max(1, Math.floor(h * s)) };
}

/** Crop in pixels of a W×H frame. null crop = the whole frame. */
export function cropRect(W: number, H: number, crop: Crop | null): Rect {
  if (!crop) return { x: 0, y: 0, w: W, h: H };
  const x = clamp(Math.round((crop.x / 100) * W), 0, W - 1);
  const y = clamp(Math.round((crop.y / 100) * H), 0, H - 1);
  const w = clamp(Math.round((crop.w / 100) * W), 1, W - x);
  const h = clamp(Math.round((crop.h / 100) * H), 1, H - y);
  return { x, y, w, h };
}

/** Output size for a cropped area of cw×ch at a chosen width, keeping the aspect ratio. */
export function outputSize(cw: number, ch: number, width: number | null): Size {
  const w = width ?? cw;
  return { w, h: Math.max(1, Math.round((ch * w) / cw)) };
}

/** Where a fw×fh picture sits inside a W×H space when it is scaled to fit and centred (letterboxed). */
export function placeContain(fw: number, fh: number, W: number, H: number): Rect {
  const s = Math.min(W / fw, H / fh);
  const w = fw * s;
  const h = fh * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/** Largest centred crop of W×H with the given aspect ratio, in percent. */
export function centredCrop(W: number, H: number, ratio: number): Crop {
  let cw = W;
  let ch = W / ratio;
  if (ch > H) {
    ch = H;
    cw = H * ratio;
  }
  return { x: ((W - cw) / 2 / W) * 100, y: ((H - ch) / 2 / H) * 100, w: (cw / W) * 100, h: (ch / H) * 100 };
}
