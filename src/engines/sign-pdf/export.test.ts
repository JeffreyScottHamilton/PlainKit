import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, degrees, type PDFPage } from 'pdf-lib';
import { PNG } from 'pngjs';
import { encryptedPdf } from '@/engines/pdf/fixtures';
import { ToolError } from '@/lib/errors';
import { signPdf, toWinAnsi } from './export';
import type { Item } from './types';
import { StandardFonts } from 'pdf-lib';
import { createHash } from 'node:crypto';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** 2 pages: page 1 portrait; page 2 has an offset CropBox and /Rotate 90, the hard case. */
async function twoPages(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const p2 = doc.addPage([300, 400]);
  p2.setCropBox(20, 30, 280, 370);
  p2.setRotation(degrees(90));
  return doc.save();
}

function markPng(): Blob {
  const png = new PNG({ width: 40, height: 16 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 10;
    png.data[i + 1] = 10;
    png.data[i + 2] = 60;
    png.data[i + 3] = i % 8 === 0 ? 255 : 120;
  }
  return new Blob([new Uint8Array(PNG.sync.write(png))], { type: 'image/png' });
}

/** Decoded text of every content-like stream in the file. Image streams decode to binary and are skipped by the search. */
function streamText(doc: PDFDocument): string {
  let out = '';
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        out += Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1') + '\n';
      } catch {
        // not decodable: not a content stream
      }
    }
  }
  return out;
}

const hasImageXObject = (doc: PDFDocument) =>
  [...doc.context.enumerateIndirectObjects()].some(([, o]) => o instanceof PDFRawStream && o.dict instanceof PDFDict && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');

describe('signPdf', () => {
  it('places image, text, check and cross, keeps the page count, and does not change the input', async () => {
    const src = await twoPages();
    const before = sha(src);
    const items: Item[] = [
      { id: 'a', kind: 'image', label: 'Signature', page: 0, x: 50, y: 500, w: 160, h: 64, blob: markPng() },
      { id: 'b', kind: 'text', page: 1, x: 40, y: 60, size: 14, text: 'Signed on 2026-11-25 ✓ café' },
      { id: 'c', kind: 'check', page: 1, x: 200, y: 100, size: 24 },
      { id: 'd', kind: 'cross', page: 1, x: 200, y: 160, size: 24 },
    ];
    const res = await signPdf(src, items);

    expect(sha(src)).toBe(before);
    expect(res.pageCount).toBe(2);
    expect(res.dropped).toBe(1); // the check character is not WinAnsi; "é" is kept

    const out = await PDFDocument.load(res.bytes, { updateMetadata: false });
    expect(out.getPageCount()).toBe(2);
    expect(hasImageXObject(out)).toBe(true);
    const text = streamText(out);
    expect(text).toContain('Tj');
    expect(text).toContain(' Do'); // the image is painted
    expect(text).toContain(' l\n'); // check and cross strokes
    // The rotated page keeps its /Rotate and its CropBox after signing.
    const p2: PDFPage = out.getPage(1);
    expect(p2.getRotation().angle).toBe(90);
    expect(p2.getCropBox().x).toBe(20);
  });

  it('rejects an encrypted PDF with a clear error', async () => {
    await expect(signPdf(encryptedPdf(), [])).rejects.toMatchObject({ code: 'encrypted' });
  });

  it('rejects a file that is not a PDF', async () => {
    const err = await signPdf(new Uint8Array([1, 2, 3, 4]), []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).code).toBe('corrupt');
  });

  it('refuses an item that points past the last page', async () => {
    await expect(signPdf(await twoPages(), [{ id: 'x', kind: 'check', page: 5, x: 0, y: 0, size: 10 }])).rejects.toMatchObject({ code: 'bad-page' });
  });
});

describe('toWinAnsi', () => {
  it('keeps Latin-1 letters and replaces what Helvetica cannot draw', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(toWinAnsi('Zoë ✓', font)).toEqual({ text: 'Zoë ?', dropped: 1 });
    expect(toWinAnsi('a\nb', font)).toEqual({ text: 'a b', dropped: 0 });
  });
});
