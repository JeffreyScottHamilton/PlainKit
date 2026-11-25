import { describe, expect, it } from 'vitest';
import { luma, preprocessRgba, stretchTable, upscaleFactor } from './preprocess';

describe('luma', () => {
  it('weights channels and keeps white and black exact', () => {
    expect(luma(255, 255, 255)).toBe(255);
    expect(luma(0, 0, 0)).toBe(0);
    expect(luma(255, 0, 0)).toBe(77);
  });
});

describe('stretchTable', () => {
  it('is the identity for a flat histogram', () => {
    const hist = new Uint32Array(256);
    hist[100] = 50;
    const t = stretchTable(hist);
    expect(t[100]).toBe(100);
    expect(t[0]).toBe(0);
  });

  it('stretches a narrow band to the full range', () => {
    const hist = new Uint32Array(256);
    hist[100] = 50;
    hist[200] = 50;
    const t = stretchTable(hist);
    expect(t[100]).toBe(0);
    expect(t[200]).toBe(255);
    expect(t[150]).toBe(128);
  });
});

describe('preprocessRgba', () => {
  it('returns a copy unchanged when both options are off', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255]);
    const out = preprocessRgba(src, { grayscale: false, autoContrast: false });
    expect(Array.from(out)).toEqual([10, 20, 30, 255]);
    expect(out).not.toBe(src);
  });

  it('greys pixels and keeps alpha without touching the input', () => {
    const src = new Uint8ClampedArray([255, 0, 0, 128]);
    const out = preprocessRgba(src, { grayscale: true, autoContrast: false });
    expect(Array.from(out)).toEqual([77, 77, 77, 128]);
    expect(src[0]).toBe(255);
  });
});

describe('upscaleFactor', () => {
  it('doubles small images when enabled', () => {
    expect(upscaleFactor(800, 600, true, 40_000_000)).toBe(2);
  });

  it('does not upscale when disabled, large, or over the pixel cap', () => {
    expect(upscaleFactor(800, 600, false, 40_000_000)).toBe(1);
    expect(upscaleFactor(1600, 100, true, 40_000_000)).toBe(1);
    expect(upscaleFactor(1500, 1500, true, 4_000_000)).toBe(1);
    expect(upscaleFactor(0, 10, true, 40_000_000)).toBe(1);
  });
});
