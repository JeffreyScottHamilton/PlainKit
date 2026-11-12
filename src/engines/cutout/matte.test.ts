import { describe, expect, it } from 'vitest';
import { MatteHistory, applyThreshold, editSize, feather, fillRect, isPng, matteToRgba, paintDab, paintLine, refine, resizeBilinear, toMatte, toNchw } from './matte';

describe('toNchw', () => {
  it('normalises per channel and lays out planes as C, H, W', () => {
    // 2x1 image: red pixel, then white pixel.
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255]);
    const t = toNchw(rgba, 2, 1, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    expect([...t]).toEqual([1, 1, -1, 1, -1, 1]); // R plane, G plane, B plane
  });
  it('uses ImageNet mean/std when given', () => {
    const t = toNchw(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
    expect(t[0]).toBeCloseTo(-0.485 / 0.229, 5);
    expect(t[2]).toBeCloseTo(-0.406 / 0.225, 5);
  });
});

describe('toMatte', () => {
  it('scales 0..1 to bytes and clamps', () => {
    expect([...toMatte([0, 0.5, 1, -0.2, 1.7])]).toEqual([0, 128, 255, 0, 255]);
  });
  it('matteToRgba puts the matte in alpha only', () => {
    expect([...matteToRgba(new Uint8Array([7, 200]))]).toEqual([0, 0, 0, 7, 0, 0, 0, 200]);
  });
});

describe('resizeBilinear', () => {
  it('keeps a constant image constant', () => {
    expect([...resizeBilinear(new Uint8Array([90, 90, 90, 90]), 2, 2, 5, 3)].every((v) => v === 90)).toBe(true);
  });
  it('interpolates a 2x1 ramp to 4x1 with half-pixel centres', () => {
    // centres map to -0.25, 0.25, 0.75, 1.25 -> clamped 0, 0.25, 0.75, 1
    expect([...resizeBilinear(new Uint8Array([0, 200]), 2, 1, 4, 1)]).toEqual([0, 50, 150, 200]);
  });
  it('downscales 4x1 to 2x1 by averaging neighbours', () => {
    expect([...resizeBilinear(new Uint8Array([0, 100, 200, 255]), 4, 1, 2, 1)]).toEqual([50, 228]);
  });
  it('identity size is a copy', () => {
    const src = new Uint8Array([1, 2, 3, 4, 5, 6]);
    expect([...resizeBilinear(src, 3, 2, 3, 2)]).toEqual([...src]);
  });
});

describe('editSize', () => {
  it('caps the long side and keeps aspect; never enlarges', () => {
    expect(editSize(4000, 3000)).toEqual({ w: 1024, h: 768 });
    expect(editSize(640, 480)).toEqual({ w: 640, h: 480 });
  });
});

describe('threshold and feather', () => {
  it('threshold zeroes values at or below t and stretches the rest', () => {
    expect([...applyThreshold(new Uint8Array([0, 50, 51, 153, 255]), 51)]).toEqual([0, 0, 0, 128, 255]);
    const m = new Uint8Array([3, 4]);
    const same = applyThreshold(m, 0);
    expect([...same]).toEqual([3, 4]);
    expect(same).not.toBe(m);
  });
  it('feather blurs a hard edge symmetrically and keeps flat areas', () => {
    const m = new Uint8Array(9).fill(0);
    m.fill(255, 5); // 1D row: 0 0 0 0 0 255 255 255 255
    const f = feather(m, 9, 1, 1);
    expect(f[0]).toBe(0);
    expect(f[8]).toBe(255);
    expect(f[4]).toBeGreaterThan(0);
    expect(f[5]).toBeLessThan(255);
    for (let i = 1; i < 9; i++) expect(f[i]!).toBeGreaterThanOrEqual(f[i - 1]!);
  });
  it('refine does not mutate its input', () => {
    const m = new Uint8Array([0, 100, 255, 30]);
    refine(m, 2, 2, 40, 1);
    expect([...m]).toEqual([0, 100, 255, 30]);
  });
});

describe('brush and rectangle edits', () => {
  it('fillRect clips to the matte and reports the touched rect', () => {
    const m = new Uint8Array(16);
    expect(fillRect(m, 4, 4, { x: 2, y: -1, w: 5, h: 2 }, 255)).toEqual({ x: 2, y: 0, w: 2, h: 1 });
    expect([...m.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    expect(m.subarray(4).every((v) => v === 0)).toBe(true);
    expect(fillRect(m, 4, 4, { x: 10, y: 10, w: 2, h: 2 }, 0)).toBeNull();
  });
  it('paintDab paints a disc only', () => {
    const m = new Uint8Array(25).fill(255);
    paintDab(m, 5, 5, 2.5, 2.5, 1.2, 0);
    expect(m[12]).toBe(0); // centre
    expect(m[7]).toBe(0); // above
    expect(m[0]).toBe(255); // corner untouched
  });
  it('paintLine leaves no gaps between distant points', () => {
    const m = new Uint8Array(20 * 3).fill(255);
    paintLine(m, 20, 3, 0.5, 1.5, 19.5, 1.5, 1, 0);
    for (let x = 0; x < 20; x++) expect(m[20 + x]).toBe(0);
  });
});

describe('MatteHistory', () => {
  it('undoes and redoes rectangle diffs', () => {
    const m = new Uint8Array(16).fill(10);
    const h = new MatteHistory(20);
    const before = m.slice();
    const r = fillRect(m, 4, 4, { x: 1, y: 1, w: 2, h: 2 }, 255);
    h.record(m, 4, before, r);
    expect(h.undo(m, 4)).toBe(true);
    expect(m.every((v) => v === 10)).toBe(true);
    expect(h.redo(m, 4)).toBe(true);
    expect(m[5]).toBe(255);
    expect(h.canRedo).toBe(false);
  });
  it('keeps at most 20 steps and a new edit clears redo', () => {
    const m = new Uint8Array(30);
    const h = new MatteHistory(20);
    for (let i = 0; i < 25; i++) {
      const before = m.slice();
      h.record(m, 30, before, fillRect(m, 30, 1, { x: i, y: 0, w: 1, h: 1 }, 255));
    }
    expect(h.size).toBe(20);
    let undone = 0;
    while (h.undo(m, 30)) undone++;
    expect(undone).toBe(20);
    // the five oldest edits are beyond the bound and stay applied
    expect([...m.subarray(0, 5)]).toEqual([255, 255, 255, 255, 255]);
    expect(m.subarray(5, 25).every((v) => v === 0)).toBe(true);
    h.redo(m, 30);
    const before = m.slice();
    h.record(m, 30, before, fillRect(m, 30, 1, { x: 29, y: 0, w: 1, h: 1 }, 255));
    expect(h.canRedo).toBe(false);
  });
});

describe('isPng', () => {
  it('checks the 8-byte signature', () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true);
    expect(isPng(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
  });
});
