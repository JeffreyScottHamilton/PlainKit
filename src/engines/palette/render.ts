import { ToolError } from '@/lib/errors';
import { sniffImageMime } from '@/engines/image/sniff';

export type PngRow = { hex: string; primary: string; secondary: string };

const WIDTH = 720;
const ROW = 120;
const PAD = 24;
const SWATCH = 96;

/** Palette card as a PNG: one swatch per row, the value and its share beside it. */
export async function renderPalettePng(rows: readonly PngRow[]): Promise<Blob> {
  const canvas = new OffscreenCanvas(WIDTH, rows.length * ROW + PAD * 2);
  const g = canvas.getContext('2d');
  if (!g) throw new ToolError('encoder-unsupported', 'This browser cannot draw the palette image.', 'Use the CSS or HEX export instead.');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.textBaseline = 'middle';
  rows.forEach((row, i) => {
    const top = PAD + i * ROW;
    const sy = top + (ROW - SWATCH) / 2;
    g.fillStyle = row.hex;
    g.fillRect(PAD, sy, SWATCH, SWATCH);
    g.strokeStyle = '#8a9089';
    g.lineWidth = 2;
    g.strokeRect(PAD + 1, sy + 1, SWATCH - 2, SWATCH - 2);
    g.fillStyle = '#1a1d19';
    g.font = '600 30px system-ui, sans-serif';
    g.fillText(row.primary, PAD + SWATCH + 24, top + ROW / 2 - 18);
    g.fillStyle = '#4b5249';
    g.font = '400 24px system-ui, sans-serif';
    g.fillText(row.secondary, PAD + SWATCH + 24, top + ROW / 2 + 20);
  });
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (blob.type !== 'image/png' || sniffImageMime(head) !== 'image/png') {
    throw new ToolError('encoder-unsupported', 'This browser cannot write PNG images.', 'Use the CSS or HEX export instead.');
  }
  return blob;
}
