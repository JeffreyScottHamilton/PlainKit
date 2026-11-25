import { describe, expect, it } from 'vitest';
import { gridOrigin, logoBox, MAX_TILES, outputMimeFor, sharePx, textBox, tileCenters } from './layout';
import { keyWhite } from './pixels';

const box = { w: 20, h: 10 };

describe('gridOrigin', () => {
  // 200 x 100 image: shorter side 100, so a 10% margin is 10 px.
  it('puts the top-left corner inset by the margin', () => {
    expect(gridOrigin(200, 100, box, 'tl', 10)).toEqual({ x: 10, y: 10 });
  });
  it('puts the bottom-right box flush with the margin', () => {
    expect(gridOrigin(200, 100, box, 'br', 10)).toEqual({ x: 170, y: 80 });
  });
  it('centres the middle-centre box and ignores margin', () => {
    expect(gridOrigin(200, 100, box, 'mc', 10)).toEqual({ x: 90, y: 45 });
  });
  it('places the edge and centre positions with zero margin', () => {
    expect(gridOrigin(200, 100, box, 'tr', 0)).toEqual({ x: 180, y: 0 });
    expect(gridOrigin(200, 100, box, 'tc', 0)).toEqual({ x: 90, y: 0 });
    expect(gridOrigin(200, 100, box, 'bl', 0)).toEqual({ x: 0, y: 90 });
    expect(gridOrigin(200, 100, box, 'ml', 0)).toEqual({ x: 0, y: 45 });
  });
  it('scales the margin with the shorter side, so mixed sizes match', () => {
    const small = gridOrigin(200, 100, { w: 0, h: 0 }, 'tl', 5);
    const big = gridOrigin(2000, 1000, { w: 0, h: 0 }, 'tl', 5);
    expect(big.x / small.x).toBeCloseTo(10);
  });
});

describe('scale', () => {
  it('sharePx is a percent of the shorter side', () => {
    expect(sharePx(800, 400, 5)).toBeCloseTo(20);
  });
  it('logo box fits its longest side to sizePct of the shorter side, keeping proportions', () => {
    const b = logoBox(400, 200, 1000, 500, 10); // 50 px longest side
    expect(b.w).toBeCloseTo(50);
    expect(b.h).toBeCloseTo(25);
  });
  it('text box height is the font size times the line factor', () => {
    expect(textBox(70, 20)).toEqual({ w: 70, h: 25 });
  });
});

describe('tileCenters', () => {
  it('at angle 0 gives a full grid whose centres step by box plus gap', () => {
    const pts = tileCenters(100, 100, { w: 10, h: 10 }, 10, 0);
    const xs = [...new Set(pts.map((p) => Math.round(p.x)))].sort((a, b) => a - b);
    const d = xs[1]! - xs[0]!;
    expect(d).toBe(20);
    // Every image corner is within one lattice cell of a centre.
    for (const [x, y] of [[0, 0], [100, 0], [0, 100], [100, 100]] as const) {
      const near = pts.some((p) => Math.abs(p.x - x) <= 10 && Math.abs(p.y - y) <= 10);
      expect(near).toBe(true);
    }
  });
  it('at a rotated angle still covers the corners of the image', () => {
    const pts = tileCenters(300, 200, { w: 40, h: 20 }, 10, -30);
    const step = Math.hypot(50, 30);
    for (const [x, y] of [[0, 0], [300, 0], [0, 200], [300, 200], [150, 100]] as const) {
      expect(pts.some((p) => Math.hypot(p.x - x, p.y - y) <= step)).toBe(true);
    }
  });
  it('always returns at least one centre for a non-empty image', () => {
    expect(tileCenters(50, 50, { w: 10, h: 10 }, 0, 45).length).toBeGreaterThan(0);
  });
  it('refuses a pattern that would draw too many copies', () => {
    expect(() => tileCenters(4000, 4000, { w: 1, h: 1 }, 0, 0)).toThrow(/too many copies/);
    expect(MAX_TILES).toBeGreaterThan(0);
  });
});

describe('outputMimeFor', () => {
  it('keeps JPEG, PNG and WebP inputs', () => {
    expect(outputMimeFor('keep', 'image/jpeg')).toBe('image/jpeg');
    expect(outputMimeFor('keep', 'image/webp')).toBe('image/webp');
  });
  it('falls back to PNG for other inputs with keep', () => {
    expect(outputMimeFor('keep', 'image/gif')).toBe('image/png');
  });
  it('uses the chosen format over the input', () => {
    expect(outputMimeFor('image/webp', 'image/png')).toBe('image/webp');
  });
});

describe('keyWhite', () => {
  it('makes white and near-white pixels transparent, leaves others', () => {
    const d = new Uint8ClampedArray([255, 255, 255, 255, 250, 252, 241, 255, 20, 240, 240, 255, 0, 0, 0, 255]);
    keyWhite(d);
    expect([d[3], d[7], d[11], d[15]]).toEqual([0, 0, 255, 255]);
  });
  it('treats a pixel with one dark channel as not white', () => {
    const d = new Uint8ClampedArray([255, 255, 200, 255]);
    keyWhite(d);
    expect(d[3]).toBe(255);
  });
});
