import { degrees, LineCapStyle, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { ToolError } from '@/lib/errors';
import { loadDocument } from '@/engines/pdf/load';
import { displayToUser } from './geometry';
import { pageGeom } from './inspect';
import type { ExportResult, Item } from './types';

/** Baseline of a text item, as a fraction of its font size below the item's top edge. */
export const BASELINE = 0.8;
const INK = rgb(0.05, 0.05, 0.05);

/** Helvetica only covers WinAnsi. Anything else becomes "?" and is counted, never silently dropped. */
export function toWinAnsi(text: string, font: PDFFont): { text: string; dropped: number } {
  let out = '';
  let dropped = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 0x20) {
      out += ' ';
      continue;
    }
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
      dropped++;
    }
  }
  return { text: out, dropped };
}

/**
 * Writes the items onto a copy of the PDF. Each item is placed in display space, then mapped to user space
 * with the page's CropBox and /Rotate. Images and text are rotated by the page rotation so they read upright.
 * The source bytes are only read, never written back.
 */
export async function signPdf(source: Uint8Array, items: readonly Item[]): Promise<ExportResult> {
  const doc = await loadDocument(source);
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const images = new Map<Blob, PDFImage>();
  let dropped = 0;

  for (const it of items) {
    const page: PDFPage | undefined = pages[it.page];
    if (!page) throw new ToolError('bad-page', 'An item points at a page that is not in this file.', 'Remove the item and export again.');
    const { box, rotation } = pageGeom(page);
    const at = (x: number, y: number) => displayToUser(box, rotation, { x, y });

    if (it.kind === 'image') {
      let img = images.get(it.blob);
      if (!img) {
        try {
          img = await doc.embedPng(new Uint8Array(await it.blob.arrayBuffer()));
        } catch {
          throw new ToolError('bad-mark', `The ${it.label.toLowerCase()} image could not be embedded.`, `Make the ${it.label.toLowerCase()} again, then export.`);
        }
        images.set(it.blob, img);
      }
      // drawImage rotates about its bottom-left corner, which is the display point (x, y + h) mapped to user space.
      const o = at(it.x, it.y + it.h);
      page.drawImage(img, { x: o.x, y: o.y, width: it.w, height: it.h, rotate: degrees(rotation) });
    } else if (it.kind === 'text' || it.kind === 'date') {
      const s = toWinAnsi(it.text, font);
      dropped += s.dropped;
      const o = at(it.x, it.y + it.size * BASELINE);
      page.drawText(s.text, { x: o.x, y: o.y, size: it.size, font, color: INK, rotate: degrees(rotation) });
    } else {
      // Vector marks in unit coordinates of the item's square, so they scale with its size.
      const segs: [number, number, number, number][] =
        it.kind === 'check'
          ? [
              [0.12, 0.55, 0.4, 0.82],
              [0.4, 0.82, 0.88, 0.18],
            ]
          : [
              [0.15, 0.15, 0.85, 0.85],
              [0.85, 0.15, 0.15, 0.85],
            ];
      const thickness = Math.max(0.8, it.size * 0.1);
      for (const [ax, ay, bx, by] of segs) {
        const s = it.size;
        page.drawLine({
          start: at(it.x + ax * s, it.y + ay * s),
          end: at(it.x + bx * s, it.y + by * s),
          thickness,
          color: INK,
          lineCap: LineCapStyle.Round,
        });
      }
    }
  }

  const bytes = await doc.save();
  const check = await PDFDocument.load(bytes, { updateMetadata: false });
  if (check.getPageCount() !== pages.length) {
    throw new ToolError('verify-failed', `The signed file has ${check.getPageCount()} pages instead of ${pages.length}.`, 'Try again.');
  }
  return { bytes, pageCount: pages.length, dropped };
}
