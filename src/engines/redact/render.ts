import { ToolError } from '../../lib/errors';
import { assertDecodable, parseHexColor } from '../image/dimensions';
import { sniffBlob } from '../image/sniff';
import { clampRect, type Region } from './model';
import type { RenderFormat, RenderOutput } from './types';

// Runs in the redact worker (OffscreenCanvas). Output is a new flat bitmap: no layers, no original, no metadata.
const JPEG_QUALITY = 0.92;
const DEFAULT_FILL = '#000000';

/** Blur needs canvas filters. Detected by setting and reading back, because some browsers ignore the property silently. */
function canBlur(): boolean {
  const ctx = new OffscreenCanvas(1, 1).getContext('2d');
  if (!ctx || !('filter' in ctx)) return false;
  ctx.filter = 'blur(2px)';
  return ctx.filter === 'blur(2px)';
}

/** Averages the ORIGINAL pixels of each block and fills it opaque. Block = max(8, round(min(w,h)/8)). */
function pixelate(data: Uint8ClampedArray, imgW: number, r: Region, out: OffscreenCanvasRenderingContext2D): void {
  const block = Math.max(8, Math.round(Math.min(r.w, r.h) / 8));
  for (let by = r.y; by < r.y + r.h; by += block) {
    for (let bx = r.x; bx < r.x + r.w; bx += block) {
      const x1 = Math.min(bx + block, r.x + r.w);
      const y1 = Math.min(by + block, r.y + r.h);
      let R = 0;
      let G = 0;
      let B = 0;
      let n = 0;
      for (let y = by; y < y1; y++) {
        for (let x = bx; x < x1; x++) {
          const i = (y * imgW + x) * 4;
          R += data[i]!;
          G += data[i + 1]!;
          B += data[i + 2]!;
          n++;
        }
      }
      out.fillStyle = `rgb(${Math.round(R / n)}, ${Math.round(G / n)}, ${Math.round(B / n)})`;
      out.fillRect(bx, by, x1 - bx, y1 - by);
    }
  }
}

/**
 * Gaussian blur of the region using the original pixels around it. The source is padded by stretching its edge
 * pixels, so a region at the image border does not blend in transparency, and the blur is clipped to the region.
 */
function blur(src: OffscreenCanvas, imgW: number, imgH: number, r: Region, out: OffscreenCanvasRenderingContext2D): void {
  const radius = Math.max(12, Math.round(Math.min(r.w, r.h) / 4));
  const pad = radius * 3;
  const pw = r.w + 2 * pad;
  const ph = r.h + 2 * pad;
  const ix0 = Math.max(0, r.x - pad);
  const iy0 = Math.max(0, r.y - pad);
  const ix1 = Math.min(imgW, r.x + r.w + pad);
  const iy1 = Math.min(imgH, r.y + r.h + pad);
  const dx0 = ix0 - r.x + pad;
  const dy0 = iy0 - r.y + pad;
  const dw = ix1 - ix0;
  const dh = iy1 - iy0;

  const padded = new OffscreenCanvas(pw, ph);
  const pc = padded.getContext('2d')!;
  pc.drawImage(src, ix0, iy0, dw, dh, dx0, dy0, dw, dh);
  if (dx0 > 0) pc.drawImage(src, 0, iy0, 1, dh, 0, dy0, dx0, dh);
  if (dx0 + dw < pw) pc.drawImage(src, imgW - 1, iy0, 1, dh, dx0 + dw, dy0, pw - dx0 - dw, dh);
  if (dy0 > 0) pc.drawImage(src, ix0, 0, dw, 1, dx0, 0, dw, dy0);
  if (dy0 + dh < ph) pc.drawImage(src, ix0, imgH - 1, dw, 1, dx0, dy0 + dh, dw, ph - dy0 - dh);

  out.save();
  out.beginPath();
  out.rect(r.x, r.y, r.w, r.h);
  out.clip();
  out.filter = `blur(${radius}px)`;
  out.drawImage(padded, r.x - pad, r.y - pad);
  out.restore();
}

export async function renderRedacted(input: Blob, regions: Region[], format: RenderFormat): Promise<RenderOutput> {
  const mime = await sniffBlob(input);
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
    throw new ToolError('unsupported-input', 'Only JPEG, PNG and WebP images can be redacted.', 'Choose a JPEG, PNG or WebP file.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
  } catch {
    throw new ToolError('decode-failed', 'This image could not be decoded. It may be damaged.', 'Try another file.');
  }
  const W = bitmap.width;
  const H = bitmap.height;
  try {
    assertDecodable(W, H);
  } catch (e) {
    bitmap.close();
    throw e;
  }
  const bounds = { width: W, height: H };
  const rects = regions.map((r) => ({ ...r, ...clampRect(r, bounds) }));
  if (rects.some((r) => r.style === 'blur') && !canBlur()) {
    bitmap.close();
    throw new ToolError('blur-unsupported', 'This browser cannot apply blur, so the blur region cannot be exported.', 'Change that region to Solid or Pixelate, then export again.');
  }

  // src keeps the original pixels for every read; out receives the redaction.
  const src = new OffscreenCanvas(W, H);
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const out = new OffscreenCanvas(W, H);
  const octx = out.getContext('2d')!;
  if (format === 'image/jpeg') {
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, W, H);
  }
  octx.drawImage(src, 0, 0);

  let data: Uint8ClampedArray | undefined;
  for (const r of rects) {
    if (r.style === 'solid') {
      octx.fillStyle = (r.color && parseHexColor(r.color)) || DEFAULT_FILL;
      octx.fillRect(r.x, r.y, r.w, r.h);
    } else if (r.style === 'pixelate') {
      data ??= sctx.getImageData(0, 0, W, H).data;
      pixelate(data, W, r, octx);
    } else {
      blur(src, W, H, r, octx);
    }
  }

  const blob = await out.convertToBlob({ type: format, quality: format === 'image/jpeg' ? JPEG_QUALITY : undefined });
  if ((await sniffBlob(blob)) !== (format === 'image/jpeg' ? 'image/jpeg' : 'image/png')) {
    throw new ToolError('encoder-unsupported', `This browser cannot write ${format === 'image/jpeg' ? 'JPEG' : 'PNG'}.`, 'Choose the other output format.');
  }
  return { blob, mime: format, width: W, height: H };
}
