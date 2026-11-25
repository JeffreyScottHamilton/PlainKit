import { PDFDocument } from 'pdf-lib';
import { ToolError } from '@/lib/errors';
import type { PageSizeChoice } from './types';

/** Pages are JPEG bytes with their pixel size. */
export type PdfPage = { bytes: Uint8Array; width: number; height: number };

const FIT_DPI = 150;
const MARGIN_PT = 18;
const SIZES: Record<Exclude<PageSizeChoice, 'fit'>, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

/** One page per scan. 'fit' sizes each page to its image at FIT_DPI; A4 and Letter place the image inside a margin. */
export async function buildPdf(pages: PdfPage[], size: PageSizeChoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const img = await doc.embedJpg(p.bytes);
    if (size === 'fit') {
      const pw = (p.width * 72) / FIT_DPI;
      const ph = (p.height * 72) / FIT_DPI;
      doc.addPage([pw, ph]).drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      continue;
    }
    let [pw, ph] = SIZES[size];
    if (p.width > p.height) [pw, ph] = [ph, pw];
    const s = Math.min((pw - 2 * MARGIN_PT) / p.width, (ph - 2 * MARGIN_PT) / p.height, 1);
    const iw = p.width * s;
    const ih = p.height * s;
    doc.addPage([pw, ph]).drawImage(img, { x: (pw - iw) / 2, y: (ph - ih) / 2, width: iw, height: ih });
  }
  const bytes = await doc.save();
  const check = await PDFDocument.load(bytes);
  if (check.getPageCount() !== pages.length) throw new ToolError('verify-failed', 'The PDF did not contain the expected number of pages.', 'Try again.');
  return bytes;
}
