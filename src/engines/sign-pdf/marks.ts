import { ToolError } from '@/lib/errors';
import type { Mark } from './types';

export type Pt = { x: number; y: number };
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_SIDE = 1600;
const MAX_PIXELS = 25_000_000;

/** Paper-white becomes transparent. The fade band keeps anti-aliased edges soft. In place. */
export function whiteToTransparent(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const min = Math.min(px[i]!, px[i + 1]!, px[i + 2]!);
    px[i + 3] = Math.round(Math.min(1, Math.max(0, (250 - min) / 60)) * 255);
  }
}

/** Bounding box of all ink points, padded, so a drawn signature is not surrounded by blank paper. */
export function inkBounds(strokes: readonly (readonly Pt[])[], pad = 8): { x0: number; y0: number; x1: number; y1: number } | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes)
    for (const p of s) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  if (!Number.isFinite(x0)) return undefined;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Encodes a canvas as PNG and checks the magic bytes, since browsers silently fall back to other encoders. */
export async function canvasToMark(c: HTMLCanvasElement): Promise<Mark> {
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) throw new ToolError('encode', 'This browser could not create the signature image.', 'Try again, or use a different browser.');
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (!PNG_SIG.every((b, i) => head[i] === b)) throw new ToolError('encode', 'This browser could not create a PNG signature image.', 'Try again, or use a different browser.');
  return { blob, w: c.width, h: c.height };
}

/** Strokes (in the pad's own pixels) cropped to their ink and rendered as a transparent PNG. */
export async function strokesToMark(strokes: readonly (readonly Pt[])[]): Promise<Mark> {
  const b = inkBounds(strokes);
  if (!b) throw new ToolError('empty', 'The signature is empty.', 'Draw a signature first.');
  const c = newCanvas(b.x1 - b.x0, b.y1 - b.y0);
  const ctx = c.getContext('2d');
  if (!ctx) throw new ToolError('encode', 'This browser could not draw the signature.', 'Try again, or use a different browser.');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111';
  for (const s of strokes) {
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc(s[0]!.x - b.x0, s[0]!.y - b.y0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(s[0]!.x - b.x0, s[0]!.y - b.y0);
    for (let i = 1; i < s.length - 1; i++) {
      const mx = (s[i]!.x + s[i + 1]!.x) / 2 - b.x0;
      const my = (s[i]!.y + s[i + 1]!.y) / 2 - b.y0;
      ctx.quadraticCurveTo(s[i]!.x - b.x0, s[i]!.y - b.y0, mx, my);
    }
    const last = s[s.length - 1]!;
    ctx.lineTo(last.x - b.x0, last.y - b.y0);
    ctx.stroke();
  }
  return canvasToMark(c);
}

/** A typed signature in a script-like italic. Not handwriting; the UI says so. */
export async function typedMark(text: string): Promise<Mark> {
  const family = '"Inter Variable", Inter, "Segoe Script", "Brush Script MT", cursive';
  try {
    await document.fonts.load(`italic 400 120px ${family}`, text);
  } catch {
    // Fall back to whatever the browser has; the generic cursive family still applies.
  }
  const probe = newCanvas(1, 1).getContext('2d');
  if (!probe) throw new ToolError('encode', 'This browser could not draw the signature.', 'Try again, or use a different browser.');
  const font = `italic 400 120px ${family}`;
  probe.font = font;
  const width = probe.measureText(text).width;
  const c = newCanvas(width + 40, 200);
  const ctx = c.getContext('2d');
  if (!ctx) throw new ToolError('encode', 'This browser could not draw the signature.', 'Try again, or use a different browser.');
  ctx.font = font;
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 20, 150);
  return canvasToMark(c);
}

/** Uploaded image to a transparent PNG. The image is decoded (EXIF honoured), scaled to a bounded size, and white is removed. */
export async function imageFileToMark(file: File): Promise<Mark> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ToolError('corrupt', 'This image could not be read.', 'Use a PNG or JPEG signature photo.');
  }
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw new ToolError('too-large', 'This image is too large to use as a signature.', 'Crop the image closer to the signature.');
    const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const c = newCanvas(bitmap.width * k, bitmap.height * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ToolError('encode', 'This browser could not read the image.', 'Try again, or use a different browser.');
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    whiteToTransparent(img.data);
    ctx.putImageData(img, 0, 0);
    return await canvasToMark(c);
  } finally {
    bitmap.close();
  }
}
