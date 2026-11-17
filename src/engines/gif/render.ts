// Draws a composed frame into a crop and output size. Shared by the page (preview) and the worker (export).
import { placeContain, type Rect, type Size } from './geometry';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Pixels = OffscreenCanvas | ImageBitmap | HTMLCanvasElement;

/**
 * Paints `src` (a picture of any size) letterboxed into a space×space rectangle, then takes `crop` from that space
 * and scales it to outW×outH. Background is white, so the output has no transparency for GIF.
 */
export function renderInto(ctx: Ctx2D, src: Pixels, space: Size, crop: Rect, outW: number, outH: number): void {
  const p = placeContain(src.width, src.height, space.w, space.h);
  const sx = outW / crop.w;
  const sy = outH / crop.h;
  ctx.setTransform(sx, 0, 0, sy, -crop.x * sx, -crop.y * sy);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, space.w, space.h);
  ctx.drawImage(src as CanvasImageSource, p.x, p.y, p.w, p.h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
