import { ToolError } from '@/lib/errors';
import type { Box, OutputMime, Point, Position } from './types';

/** Inputs this tool decodes. Anything else is refused before a worker starts. */
export const WM_INPUT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'] as const;
export type WmInput = (typeof WM_INPUT_MIMES)[number];

export const EXT: Record<OutputMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Upper bound on pattern copies, so a tiny spacing on a large image cannot stall the worker. */
export const MAX_TILES = 20000;
/** Line box height as a multiple of the font size. */
const LINE = 1.25;

/** A percentage of the shorter side, in pixels of this canvas. */
export const sharePx = (W: number, H: number, pct: number): number => (Math.min(W, H) * pct) / 100;

export const fontPx = (W: number, H: number, sizePct: number): number => sharePx(W, H, sizePct);

export function textBox(width: number, px: number): Box {
  return { w: width, h: px * LINE };
}

/** Scales the logo so its longest side is sizePct of the shorter image side. */
export function logoBox(lw: number, lh: number, W: number, H: number, sizePct: number): Box {
  const k = sharePx(W, H, sizePct) / Math.max(lw, lh);
  return { w: lw * k, h: lh * k };
}

/** Top-left corner of a box in one of nine positions, inset by the margin. */
export function gridOrigin(W: number, H: number, box: Box, position: Position, marginPct: number): Point {
  const m = sharePx(W, H, marginPct);
  const row = position[0];
  const col = position[1];
  const x = col === 'l' ? m : col === 'c' ? (W - box.w) / 2 : W - box.w - m;
  const y = row === 't' ? m : row === 'm' ? (H - box.h) / 2 : H - box.h - m;
  return { x, y };
}

const tooDense = () =>
  new ToolError('too-dense', 'This pattern would draw too many copies for this image.', 'Increase the spacing or make the watermark larger.');

/**
 * Centres of a diagonal lattice of boxes that covers the whole image. The lattice is laid out
 * unrotated and then turned by `angleDeg` (clockwise, as canvas rotate does) about the image centre.
 */
export function tileCenters(W: number, H: number, box: Box, gapPx: number, angleDeg: number): Point[] {
  const stepX = box.w + gapPx;
  const stepY = box.h + gapPx;
  const reach = Math.hypot(W, H) / 2 + Math.hypot(box.w, box.h);
  const nx = Math.ceil(reach / stepX);
  const ny = Math.ceil(reach / stepY);
  if (!((2 * nx + 1) * (2 * ny + 1) <= 4 * MAX_TILES)) throw tooDense();

  const th = (angleDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const cx = W / 2;
  const cy = H / 2;
  const pad = Math.hypot(box.w, box.h);
  const out: Point[] = [];
  for (let i = -nx; i <= nx; i++) {
    for (let j = -ny; j <= ny; j++) {
      const lx = i * stepX;
      const ly = j * stepY;
      const x = cx + lx * c - ly * s;
      const y = cy + lx * s + ly * c;
      if (x >= -pad && x <= W + pad && y >= -pad && y <= H + pad) out.push({ x, y });
    }
  }
  if (out.length > MAX_TILES) throw tooDense();
  return out;
}

/** 'keep' follows the input when the browser can write it; otherwise PNG, which always works. */
export function outputMimeFor(format: 'keep' | OutputMime, input: WmInput): OutputMime {
  if (format !== 'keep') return format;
  return input === 'image/jpeg' || input === 'image/png' || input === 'image/webp' ? input : 'image/png';
}
