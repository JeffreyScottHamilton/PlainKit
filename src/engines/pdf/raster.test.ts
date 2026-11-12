import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { imagesToPdf, rewritePdf } from './raster';

const png = (w: number, h: number) => {
  const p = new PNG({ width: w, height: h });
  p.data.fill(200);
  return new Uint8Array(PNG.sync.write(p));
};

describe('pdf raster helpers', () => {
  it('makes one page per image at the image size (96 px per inch)', async () => {
    const bytes = await imagesToPdf([{ bytes: png(400, 200), mime: 'image/png' }, { bytes: png(100, 300), mime: 'image/png' }], 'image', 0);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 300, height: 150 });
  });
  it('fits images on A4 without enlarging and turns the page for landscape images', async () => {
    const doc = await PDFDocument.load(await imagesToPdf([{ bytes: png(400, 200), mime: 'image/png' }], 'a4', 36));
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });
  it('rewrites a PDF keeping its pages, and refuses junk', async () => {
    const src = await PDFDocument.create();
    for (let i = 0; i < 5; i++) src.addPage([200 + i, 300]);
    const out = await rewritePdf(await src.save({ useObjectStreams: false }));
    expect(out.pageCount).toBe(5);
    expect((await PDFDocument.load(out.bytes)).getPage(4).getWidth()).toBe(204);
    await expect(rewritePdf(new Uint8Array([1, 2, 3]))).rejects.toThrow(/could not be read as a PDF/);
  });
});
