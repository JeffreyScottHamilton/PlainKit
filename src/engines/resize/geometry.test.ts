import { describe, expect, it } from 'vitest';
import type { RenderSettings } from './types';
import { cropNorm, fitCrop, flipNorm, moveNorm, orientedSize, outputMimeFor, planDownscale, planResize, resizeNorm, resolveTarget, rotateNorm } from './geometry';

const FULL = { x: 0, y: 0, w: 1, h: 1 };
const base: RenderSettings = {
  turns: 0, flipH: false, flipV: false, crop: FULL, aspect: null,
  target: { kind: 'fit', maxEdge: 100 }, format: 'keep', quality: 0.8,
};

describe('orientedSize', () => {
  it('swaps sides for odd quarter turns only', () => {
    expect(orientedSize(64, 48, 0)).toEqual({ width: 64, height: 48 });
    expect(orientedSize(64, 48, 1)).toEqual({ width: 48, height: 64 });
    expect(orientedSize(64, 48, 2)).toEqual({ width: 64, height: 48 });
    expect(orientedSize(64, 48, 3)).toEqual({ width: 48, height: 64 });
  });
});

describe('fitCrop', () => {
  it('free crop keeps the box in whole pixels', () => {
    expect(fitCrop(200, 100, { x: 0.25, y: 0, w: 0.5, h: 1 }, null)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
  });
  it('1:1 inside a wide image is centred and square', () => {
    expect(fitCrop(1600, 900, FULL, 1)).toEqual({ x: 350, y: 0, w: 900, h: 900 });
  });
  it('16:9 inside a square image is centred and exact', () => {
    const r = fitCrop(1000, 1000, FULL, 16 / 9);
    expect(r.w).toBe(1000);
    expect(r.h).toBe(563);
    expect(r.y).toBe(219);
  });
  it('never leaves the image', () => {
    const r = fitCrop(10, 10, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, 3);
    expect(r.x + r.w).toBeLessThanOrEqual(10);
    expect(r.y + r.h).toBeLessThanOrEqual(10);
    expect(r.w).toBeGreaterThanOrEqual(1);
  });
});

describe('cropNorm', () => {
  it('returns the fitted crop as fractions', () => {
    expect(cropNorm(1600, 900, FULL, 1)).toEqual({ x: 350 / 1600, y: 0, w: 900 / 1600, h: 1 });
  });
});

describe('moveNorm and resizeNorm', () => {
  it('moves and clamps inside the image', () => {
    expect(moveNorm({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.3, -0.9)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.4 });
  });
  it('keeps the aspect ratio when resizing', () => {
    const n = resizeNorm({ x: 0, y: 0, w: 0.5, h: 0.5 }, 0.1, 0, 200, 100, 2);
    expect((n.w * 200) / (n.h * 100)).toBeCloseTo(2, 6);
    expect(n.w).toBeCloseTo(0.6, 6);
  });
  it('stops at the image edge', () => {
    const n = resizeNorm({ x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, 0.9, 0.9, 100, 100, null);
    expect(n).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });
});

describe('rotateNorm and flipNorm follow the pixel transform', () => {
  it('a clockwise turn maps the top-left corner to the top-right', () => {
    const r = rotateNorm({ x: 0, y: 0, w: 0.25, h: 0.5 }, 1);
    expect(r).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.25 });
  });
  it('three clockwise turns equal one counter-clockwise turn', () => {
    const n = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const cw3 = rotateNorm(rotateNorm(rotateNorm(n, 1), 1), 1);
    const ccw = rotateNorm(n, 3);
    expect(cw3.x).toBeCloseTo(ccw.x, 9);
    expect(cw3.y).toBeCloseTo(ccw.y, 9);
    expect(cw3.w).toBeCloseTo(ccw.w, 9);
    expect(cw3.h).toBeCloseTo(ccw.h, 9);
  });
  it('flips mirror the box', () => {
    expect(flipNorm({ x: 0, y: 0.1, w: 0.25, h: 0.5 }, 'h')).toEqual({ x: 0.75, y: 0.1, w: 0.25, h: 0.5 });
    expect(flipNorm({ x: 0, y: 0.1, w: 0.25, h: 0.5 }, 'v')).toEqual({ x: 0, y: 0.4, w: 0.25, h: 0.5 });
  });
});

describe('resolveTarget', () => {
  it('fit never enlarges', () => {
    expect(resolveTarget(40, 30, { kind: 'fit', maxEdge: 400 })).toEqual({ width: 40, height: 30 });
    expect(resolveTarget(400, 300, { kind: 'fit', maxEdge: 200 })).toEqual({ width: 200, height: 150 });
  });
  it('width derives height from the crop ratio', () => {
    expect(resolveTarget(1600, 900, { kind: 'width', width: 800 })).toEqual({ width: 800, height: 450 });
  });
  it('percent scales both sides and keeps at least 1 px', () => {
    expect(resolveTarget(100, 3, { kind: 'percent', percent: 50 })).toEqual({ width: 50, height: 2 });
    expect(resolveTarget(10, 10, { kind: 'percent', percent: 1 })).toEqual({ width: 1, height: 1 });
  });
});

describe('planResize', () => {
  it('rotation swaps the planned size', () => {
    const r = planResize(64, 48, { ...base, turns: 1, target: { kind: 'exact', width: 48, height: 64 } });
    expect(r).toEqual({ ok: true, plan: { crop: { x: 0, y: 0, w: 48, h: 64 }, width: 48, height: 64, upscaled: false } });
  });
  it('a 1:1 crop of a 64 x 48 image is 48 x 48', () => {
    const r = planResize(64, 48, { ...base, aspect: 1, target: { kind: 'fit', maxEdge: 256 } });
    expect(r.ok && r.plan.crop).toEqual({ x: 8, y: 0, w: 48, h: 48 });
    expect(r.ok && r.plan.width).toBe(48);
  });
  it('flags a target larger than the crop as an upscale', () => {
    const r = planResize(64, 48, { ...base, target: { kind: 'exact', width: 128, height: 48 } });
    expect(r.ok && r.plan.upscaled).toBe(true);
  });
  it('refuses outputs over the side limit', () => {
    const r = planResize(64, 48, { ...base, target: { kind: 'percent', percent: 800 }, quality: 1 });
    expect(r.ok).toBe(true);
    const big = planResize(64, 48, { ...base, target: { kind: 'exact', width: 9000, height: 10 } });
    expect(big.ok).toBe(false);
  });
});

describe('planDownscale', () => {
  it('halves until within twice the target', () => {
    expect(planDownscale({ width: 1000, height: 1000 }, { width: 100, height: 100 })).toEqual([
      { width: 500, height: 500 },
      { width: 250, height: 250 },
      { width: 125, height: 125 },
    ]);
  });
  it('needs no steps for small reductions or upscales', () => {
    expect(planDownscale({ width: 300, height: 300 }, { width: 200, height: 200 })).toEqual([]);
    expect(planDownscale({ width: 10, height: 10 }, { width: 40, height: 40 })).toEqual([]);
  });
  it('keeps both sides moving toward the target', () => {
    const steps = planDownscale({ width: 1000, height: 100 }, { width: 50, height: 50 });
    expect(steps.at(-1)).toEqual({ width: 63, height: 50 });
  });
});

describe('outputMimeFor', () => {
  it('keeps JPEG, PNG and WebP and falls back to PNG otherwise', () => {
    expect(outputMimeFor('keep', 'image/jpeg')).toBe('image/jpeg');
    expect(outputMimeFor('keep', 'image/gif')).toBe('image/png');
    expect(outputMimeFor('image/webp', 'image/png')).toBe('image/webp');
  });
});
