import { describe, expect, it } from 'vitest';
import { PAPERS, clampPan, cropRect, defaultPan, eyeLineBand, fitCrop, layoutSheet, mmToPt, mmToPx, outputPx, pageMm, parseMm, pxToMm } from './geometry';

const UK = { wMm: 35, hMm: 45 };
const US = { wMm: 51, hMm: 51 };
const paper = (id: string) => PAPERS.find((p) => p.id === id)!;

describe('mm and px', () => {
  it('converts at 300 and 600 DPI', () => {
    expect(mmToPx(35, 300)).toBe(413);
    expect(mmToPx(45, 300)).toBe(531);
    expect(mmToPx(35, 600)).toBe(827);
    expect(mmToPx(45, 600)).toBe(1063);
    expect(outputPx(51, 51, 300)).toEqual({ w: 602, h: 602 });
  });
  it('maps mm to PDF points and back', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 10);
    expect(pxToMm(300, 300)).toBeCloseTo(25.4, 10);
    expect(pageMm(paper('4x6'), 'landscape')).toEqual({ wMm: 152.4, hMm: 101.6 });
  });
});

describe('crop rect', () => {
  it('fits the largest centred crop with the preset aspect', () => {
    const r = fitCrop(1200, 1600, UK.wMm / UK.hMm);
    expect(r.w).toBe(1200);
    expect(r.w / r.h).toBeCloseTo(35 / 45, 10);
    expect(r.y).toBeCloseTo((1600 - r.h) / 2, 10);
  });
  it('keeps the crop inside the image when clamped', () => {
    const a = UK.wMm / UK.hMm;
    const left = cropRect(1200, 1600, a, { cx: 0, cy: 800, zoom: 1 });
    expect(left.x).toBeGreaterThanOrEqual(0);
    expect(left.x + left.w).toBeLessThanOrEqual(1200 + 1e-9);
    const corner = cropRect(1200, 1600, a, { cx: 99999, cy: 99999, zoom: 2 });
    expect(corner.x + corner.w).toBeLessThanOrEqual(1200 + 1e-9);
    expect(corner.y + corner.h).toBeLessThanOrEqual(1600 + 1e-9);
  });
  it('lets the crop leave the image only when allowed', () => {
    const a = UK.wMm / UK.hMm;
    expect(cropRect(1200, 1600, a, { cx: 0, cy: 800, zoom: 1 }, true).x).toBeCloseTo(-600, 6);
    expect(clampPan({ cx: 0, cy: 800, zoom: 1 }, 1200, 1600, a).cx).toBeCloseTo(600, 6);
  });
  it('clamps zoom between 1 and the maximum', () => {
    expect(clampPan({ ...defaultPan(1200, 1600), zoom: 10 }, 1200, 1600, 0.78).zoom).toBe(4);
    expect(clampPan({ ...defaultPan(1200, 1600), zoom: 0.2 }, 1200, 1600, 0.78).zoom).toBe(1);
  });
  it('keeps the preset aspect at any zoom', () => {
    const r = cropRect(1200, 1600, UK.wMm / UK.hMm, { cx: 600, cy: 800, zoom: 3 });
    expect(r.w / r.h).toBeCloseTo(35 / 45, 10);
  });
});

describe('guides', () => {
  it('places the eye-line band from the top as fractions of height', () => {
    const b = eyeLineBand(45, [28, 35])!;
    expect(b.top).toBeCloseTo(1 - 35 / 45, 10);
    expect(b.bottom).toBeCloseTo(1 - 28 / 45, 10);
    expect(eyeLineBand(45, undefined)).toBeNull();
  });
});

describe('sheet layout', () => {
  it('fits 35 x 45 mm six times on 4 x 6 in', () => {
    const s = layoutSheet(paper('4x6'), UK);
    expect(s.count).toBe(6);
    expect(s.orientation).toBe('portrait');
  });
  it('fits 35 x 45 mm thirty times on A4', () => {
    expect(layoutSheet(paper('a4'), UK).count).toBe(30);
  });
  it('fits 51 x 51 mm twice on 4 x 6 in', () => {
    expect(layoutSheet(paper('4x6'), US).count).toBe(2);
  });
  it('keeps every photo inside the margins and never scales it', () => {
    const p = paper('a4');
    const s = layoutSheet(p, UK);
    for (const pos of s.positions) {
      expect(pos.xMm).toBeGreaterThanOrEqual(5);
      expect(pos.xMm + UK.wMm).toBeLessThanOrEqual(p.wMm - 5 + 1e-9);
      expect(pos.yMm + UK.hMm).toBeLessThanOrEqual(p.hMm - 5 + 1e-9);
    }
  });
  it('returns zero when the photo is larger than the paper', () => {
    expect(layoutSheet(paper('4x6'), { wMm: 200, hMm: 200 }).count).toBe(0);
  });
});

describe('custom size input', () => {
  it('accepts numbers from 5 to 300 mm only', () => {
    expect(parseMm(' 35.5 ')).toBe(35.5);
    expect(parseMm('4')).toBeNull();
    expect(parseMm('301')).toBeNull();
    expect(parseMm('abc')).toBeNull();
    expect(parseMm('-3')).toBeNull();
  });
});
