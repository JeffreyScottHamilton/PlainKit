import { describe, expect, it } from 'vitest';
import { centredCrop, cropRect, fitSize, outputSize, placeContain } from './geometry';

describe('fitSize', () => {
  it('keeps small pictures as they are and never enlarges', () => {
    expect(fitSize(320, 240, 1920, 1920 * 1080)).toEqual({ w: 320, h: 240 });
  });
  it('scales the longest edge down and keeps the aspect ratio', () => {
    expect(fitSize(3840, 2160, 1920, Infinity)).toEqual({ w: 1920, h: 1080 });
    expect(fitSize(1000, 500, 320, Infinity)).toEqual({ w: 320, h: 160 });
  });
  it('applies the pixel cap by area', () => {
    const r = fitSize(4000, 3000, Infinity, 1920 * 1080);
    expect(r.w * r.h).toBeLessThanOrEqual(1920 * 1080);
    expect(Math.abs(r.w / r.h - 4 / 3)).toBeLessThan(0.01);
  });
});

describe('cropRect', () => {
  it('returns the whole frame without a crop', () => {
    expect(cropRect(200, 100, null)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });
  it('converts percentages to whole pixels inside the frame', () => {
    expect(cropRect(200, 100, { x: 25, y: 10, w: 50, h: 80 })).toEqual({ x: 50, y: 10, w: 100, h: 80 });
  });
  it('never leaves the frame or returns an empty rectangle', () => {
    const r = cropRect(200, 100, { x: 90, y: 99, w: 50, h: 0 });
    expect(r.x + r.w).toBeLessThanOrEqual(200);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });
});

describe('outputSize', () => {
  it('keeps the cropped size when no width is chosen', () => {
    expect(outputSize(160, 90, null)).toEqual({ w: 160, h: 90 });
  });
  it('sets the width and follows the aspect ratio for the height', () => {
    expect(outputSize(160, 90, 320)).toEqual({ w: 320, h: 180 });
    expect(outputSize(100, 300, 50)).toEqual({ w: 50, h: 150 });
  });
});

describe('placeContain', () => {
  it('centres a picture with the same aspect ratio exactly', () => {
    expect(placeContain(400, 200, 800, 400)).toEqual({ x: 0, y: 0, w: 800, h: 400 });
  });
  it('letterboxes a picture with a different aspect ratio', () => {
    expect(placeContain(400, 400, 800, 400)).toEqual({ x: 200, y: 0, w: 400, h: 400 });
  });
});

describe('centredCrop', () => {
  it('crops a 16:9 area out of a 4:3 frame, centred vertically', () => {
    const c = centredCrop(400, 300, 16 / 9);
    expect(c.x).toBeCloseTo(0);
    expect(c.w).toBeCloseTo(100);
    expect(c.h).toBeCloseTo((225 / 300) * 100);
    expect(c.y).toBeCloseTo((1 - 225 / 300) * 50);
  });
  it('crops a square out of a landscape frame, centred horizontally', () => {
    expect(centredCrop(400, 300, 1)).toEqual({ x: (100 / 400) * 50, y: 0, w: 75, h: 100 });
  });
});
