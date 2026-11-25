import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildPdf } from './export';
import { makePdf, readPages, refsFor } from './fixtures';
import { numberLabel, rotationOf, stampLayout, toDisplay, toRaw, type Rotation, type Size } from './numbering';

const ROTS: Rotation[] = [0, 90, 180, 270];

describe('numberLabel', () => {
  it('writes nothing, a bare number, or Page n of N', () => {
    expect(numberLabel('none', 1, 3)).toBeNull();
    expect(numberLabel('number', 2, 3)).toBe('2');
    expect(numberLabel('page-of', 2, 3)).toBe('Page 2 of 3');
  });
});

describe('rotation mapping', () => {
  const s: Size = { w: 200, h: 300 };

  it('normalises /Rotate angles and treats odd values as 0', () => {
    expect([0, 90, -90, 270, 450, 45].map(rotationOf)).toEqual([0, 90, 270, 270, 90, 0]);
  });

  it('maps the unrotated top-left corner to the displayed top-right after a clockwise 90', () => {
    expect(toDisplay({ x: 0, y: 300 }, s, 90)).toEqual({ x: 300, y: 200 });
  });

  it('round-trips every point for every rotation', () => {
    for (const r of ROTS) {
      for (const p of [
        { x: 0, y: 0 },
        { x: 200, y: 300 },
        { x: 37, y: 91 },
      ]) {
        const back = toRaw(toDisplay(p, s, r), s, r);
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    }
  });

  it('places the label start on the displayed bottom edge, centred, for every rotation', () => {
    const textWidth = 40;
    for (const r of ROTS) {
      const at = stampLayout(s, r, textWidth, 24);
      const onPage = toDisplay({ x: at.x, y: at.y }, s, r);
      const dw = r === 90 || r === 270 ? s.h : s.w;
      expect(onPage.x).toBeCloseTo(dw / 2 - textWidth / 2, 9);
      expect(onPage.y).toBeCloseTo(24, 9);
    }
  });

  it('gives a text angle that makes the label read upright on the displayed page', () => {
    for (const r of ROTS) {
      expect(stampLayout(s, r, 40).angle).toBe(r);
    }
  });
});

describe('buildPdf with numbering', () => {
  it('keeps the page count and sizes, and makes the file larger because the labels are drawn', async () => {
    const src = await makePdf([{ width: 200 }, { width: 210, rotate: 90 }, { width: 220 }]);
    const sources = new Map([['a', src]]);
    const pages = refsFor('a', 3);
    const plain = await buildPdf(pages, sources);
    const numbered = await buildPdf(pages, sources, 'page-of');
    expect(numbered.pageCount).toBe(3);
    const got = await readPages(numbered.bytes);
    expect(got.map((p) => p.width)).toEqual([200, 210, 220]);
    expect(got[1]!.rotation).toBe(90);
    expect(numbered.bytes.byteLength).toBeGreaterThan(plain.bytes.byteLength);
  });

  it('adds no font or text when numbering is off', async () => {
    const src = await makePdf([{ width: 200 }]);
    const a = await buildPdf(refsFor('a', 1), new Map([['a', src]]));
    const b = await buildPdf(refsFor('a', 1), new Map([['a', src]]), 'none');
    expect(b.bytes.byteLength).toBe(a.bytes.byteLength);
    const doc = await PDFDocument.load(b.bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
