import QRCode from 'qrcode';
import { ToolError } from '@/lib/errors';

export type Ecc = 'L' | 'M' | 'Q' | 'H';
export type Rgb = [number, number, number];
export type QrMatrix = { size: number; dark(row: number, col: number): boolean };

/** Encodes the text at the given correction level. Overflow becomes a ToolError with a clear message. */
export function makeMatrix(text: string, ecc: Ecc): QrMatrix {
  try {
    const m = QRCode.create(text, { errorCorrectionLevel: ecc }).modules;
    return { size: m.size, dark: (r, c) => !!m.get(r, c) };
  } catch (e) {
    if (e instanceof Error && e.message.includes('too big'))
      throw new ToolError('qr-overflow', 'Too much content for a QR code at this correction level.', 'Shorten the content, or choose a lower error correction level.');
    throw new ToolError('qr-encode', 'This content could not be encoded as a QR code.', 'Check the content and try again.');
  }
}

export type RenderOpts = { px: number; margin: number; dark: Rgb; light: Rgb };

/** Pure module-to-pixel mapping (nearest sampling). Returns RGBA bytes for px x px. */
export function renderPixels(m: QrMatrix, o: RenderOpts): Uint8ClampedArray {
  const total = m.size + 2 * o.margin;
  const out = new Uint8ClampedArray(o.px * o.px * 4);
  for (let y = 0; y < o.px; y++) {
    const r = Math.floor((y * total) / o.px) - o.margin;
    for (let x = 0; x < o.px; x++) {
      const c = Math.floor((x * total) / o.px) - o.margin;
      const dark = r >= 0 && c >= 0 && r < m.size && c < m.size && m.dark(r, c);
      const rgb = dark ? o.dark : o.light;
      const i = (y * o.px + x) * 4;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
      out[i + 3] = 255;
    }
  }
  return out;
}

export function hexOf(rgb: Rgb): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** SVG from qrcode's own renderer with the chosen colors. The logo is never embedded. */
export async function svgFor(text: string, ecc: Ecc, o: { px: number; margin: number; dark: Rgb; light: Rgb }): Promise<string> {
  try {
    return await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: ecc, margin: o.margin, width: o.px, color: { dark: hexOf(o.dark), light: hexOf(o.light) } });
  } catch {
    throw new ToolError('qr-encode', 'The SVG could not be created.', 'Try a different size or content.');
  }
}

/** Centered logo box: at most 30% of the code width or height, with a light padded backing box. */
export function logoLayout(px: number, logoW: number, logoH: number): { x: number; y: number; w: number; h: number; pad: number; coverage: number } {
  const max = px * 0.3;
  const scale = Math.min(1, max / logoW, max / logoH);
  const w = Math.round(logoW * scale);
  const h = Math.round(logoH * scale);
  const pad = Math.round(px * 0.015);
  const boxW = w + 2 * pad;
  const boxH = h + 2 * pad;
  return { x: Math.round((px - boxW) / 2) + pad, y: Math.round((px - boxH) / 2) + pad, w, h, pad, coverage: (boxW * boxH) / (px * px) };
}
