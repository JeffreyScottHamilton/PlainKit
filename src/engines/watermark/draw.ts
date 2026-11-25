import { ToolError } from '@/lib/errors';
import { gridOrigin, logoBox, fontPx, sharePx, textBox, tileCenters } from './layout';
import { keyWhite } from './pixels';
import type { Box, Point, WatermarkSettings } from './types';

/** The part of the 2D context both the DOM canvas and OffscreenCanvas share. */
export type Paint2D = Pick<
  CanvasRenderingContext2D,
  'save' | 'restore' | 'translate' | 'rotate' | 'drawImage' | 'fillText' | 'measureText' | 'globalAlpha' | 'fillStyle' | 'font' | 'textBaseline'
>;

export type LogoSource = { src: CanvasImageSource; w: number; h: number };
export type Overlay = { settings: WatermarkSettings; logo: LogoSource | null; fontCss: string };

/** Logo pixels ready to draw. With whiteTransparent, near-white is keyed out on a copy; the source is untouched. */
export function prepareLogo(src: CanvasImageSource, w: number, h: number, whiteTransparent: boolean): CanvasImageSource {
  if (!whiteTransparent) return src;
  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext('2d');
  if (!cx) throw new ToolError('no-canvas', 'This browser could not create a drawing canvas.', 'Try a different browser.');
  cx.drawImage(src, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h);
  keyWhite(px.data);
  cx.putImageData(px, 0, 0);
  return c;
}

/**
 * Draws the watermark over a base image already on `ctx`. Every size is a share of the shorter side,
 * so the same settings give the same layout at any canvas size (the preview uses this too).
 * Returns the number of copies drawn.
 */
export function drawWatermark(ctx: Paint2D, W: number, H: number, o: Overlay): number {
  const s = o.settings;
  const text = s.content.kind === 'text' ? s.content.text : null;
  const px = fontPx(W, H, s.sizePct);

  ctx.save();
  ctx.globalAlpha = s.opacity;
  ctx.fillStyle = s.color;
  ctx.textBaseline = 'top';
  if (text !== null && s.content.kind === 'text') ctx.font = `${s.content.bold ? 700 : 400} ${px}px ${o.fontCss}`;
  const box: Box | null = text !== null ? textBox(ctx.measureText(text).width, px) : o.logo ? logoBox(o.logo.w, o.logo.h, W, H, s.sizePct) : null;
  if (!box) {
    ctx.restore();
    return 0;
  }

  // Positions are box centres; the box is drawn back from its centre so rotation pivots on the middle.
  const paint = (c: Point, rad: number) => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(rad);
    if (text !== null) ctx.fillText(text, -box.w / 2, -box.h / 2);
    else if (o.logo) ctx.drawImage(o.logo.src, -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.restore();
  };

  const p = s.placement;
  let copies = 1;
  if (p.kind === 'grid') {
    const at = gridOrigin(W, H, box, p.position, p.marginPct);
    paint({ x: at.x + box.w / 2, y: at.y + box.h / 2 }, 0);
  } else {
    const centers = tileCenters(W, H, box, sharePx(W, H, p.spacingPct), p.angle);
    const rad = (p.angle * Math.PI) / 180;
    for (const c of centers) paint(c, rad);
    copies = centers.length;
  }
  ctx.restore();
  return copies;
}
