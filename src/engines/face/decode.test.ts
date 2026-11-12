import { describe, expect, it } from 'vitest';
import { decodeLevel, iou, letterbox, nms, padBox, toImageBox } from './decode';

describe('letterbox', () => {
  it('scales the long side to the model size and keeps the aspect ratio', () => {
    expect(letterbox(1280, 640, 640)).toEqual({ scale: 0.5, w: 640, h: 320 });
    expect(letterbox(320, 640, 640)).toEqual({ scale: 1, w: 320, h: 640 });
    expect(letterbox(160, 80, 640)).toEqual({ scale: 4, w: 640, h: 320 });
  });
});

describe('decodeLevel', () => {
  // size 16, stride 8 -> 2x2 cells, row-major. Cell index 3 = col 1, row 1.
  const cls = [0, 0, 0, 0.64];
  const obj = [0, 0, 0, 1];
  const bbox = new Array(16).fill(0);
  bbox.splice(12, 4, 0.5, 0.25, Math.log(2), Math.log(3));
  it('keeps only cells above the threshold and decodes centre/size', () => {
    const f = decodeLevel(cls, obj, bbox, 8, 16, 0.5);
    expect(f).toHaveLength(1);
    // score = sqrt(0.64 * 1) = 0.8; cx=(1+0.5)*8=12, cy=(1+0.25)*8=10, w=2*8=16, h=3*8=24
    expect(f[0]!.score).toBeCloseTo(0.8);
    expect(f[0]!.x).toBeCloseTo(12 - 8);
    expect(f[0]!.y).toBeCloseTo(10 - 12);
    expect(f[0]!.w).toBeCloseTo(16);
    expect(f[0]!.h).toBeCloseTo(24);
  });
  it('clamps cls and obj to 0..1 before combining', () => {
    const f = decodeLevel([4, 0, 0, 0], [4, 0, 0, 0], new Array(16).fill(0), 8, 16, 0.9);
    expect(f[0]!.score).toBe(1);
  });
});

describe('iou and nms', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  it('computes intersection over union', () => {
    expect(iou(a, { x: 5, y: 0, w: 10, h: 10 })).toBeCloseTo(50 / 150);
    expect(iou(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(0);
    expect(iou(a, a)).toBe(1);
  });
  it('keeps the best box of an overlapping group and boxes that do not overlap', () => {
    const kept = nms(
      [
        { x: 0, y: 0, w: 10, h: 10, score: 0.7 },
        { x: 1, y: 0, w: 10, h: 10, score: 0.9 },
        { x: 50, y: 50, w: 10, h: 10, score: 0.6 },
      ],
      0.3,
    );
    expect(kept.map((k) => k.score)).toEqual([0.9, 0.6]);
  });
});

describe('toImageBox', () => {
  it('maps model pixels back to the original image and clips to it', () => {
    const b = toImageBox({ x: 100, y: 50, w: 60, h: 60, score: 0.8 }, 0.5, { width: 1280, height: 640 });
    expect(b).toEqual({ x: 200, y: 100, w: 120, h: 120, score: 0.8 });
    const c = toImageBox({ x: -10, y: 300, w: 60, h: 60, score: 1 }, 0.5, { width: 1280, height: 640 });
    expect(c).toEqual({ x: 0, y: 600, w: 100, h: 40, score: 1 });
  });
});

describe('padBox', () => {
  it('grows each side by the fraction and rounds outward', () => {
    expect(padBox({ x: 100, y: 100, w: 100, h: 50 }, 0.15, { width: 1000, height: 1000 })).toEqual({ x: 85, y: 92, w: 130, h: 66 });
  });
  it('clamps to the image bounds', () => {
    expect(padBox({ x: 5, y: 5, w: 100, h: 100 }, 0.15, { width: 110, height: 200 })).toEqual({ x: 0, y: 0, w: 110, h: 120 });
  });
});
