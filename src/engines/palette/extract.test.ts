import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { extractPalette } from './extract';
import type { Rgba } from './types';

/** Builds RGBA pixels from a function of (x, y). */
function image(width: number, height: number, px: (x: number, y: number) => [number, number, number, number]): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = px(x, y);
      const i = (y * width + x) * 4;
      data.set([r, g, b, a], i);
    }
  }
  return { width, height, data };
}

describe('extractPalette', () => {
  it('returns exactly the three colors of a three-color image, with exact shares', () => {
    // 10 columns: red x 0-4 (50%), green x 5-7 (30%), blue x 8-9 (20%)
    const img = image(10, 10, (x) => (x < 5 ? [255, 0, 0, 255] : x < 8 ? [0, 255, 0, 255] : [0, 0, 255, 255]));
    const out = extractPalette(img, 5);
    expect(out.map((s) => s.hex)).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(out.map((s) => s.share)).toEqual([0.5, 0.3, 0.2].map((v) => expect.closeTo(v, 9)));
  });

  it('ignores fully and mostly transparent pixels', () => {
    const img = image(4, 1, (x) => (x < 2 ? [0, 0, 0, 0] : [255, 0, 0, 255]));
    expect(extractPalette(img, 3)).toEqual([{ hex: '#ff0000', share: 1 }]);
  });

  it('throws an explicit error when nothing is opaque', () => {
    const img = image(2, 2, () => [9, 9, 9, 0]);
    expect(() => extractPalette(img, 3)).toThrow(ToolError);
    expect(() => extractPalette(img, 3)).toThrow(expect.objectContaining({ code: 'no-opaque-pixels' }));
  });

  it('merges similar colors down to k and keeps shares summing to 1', () => {
    // Two groups of near-identical reds and blues, 50 pixels each, every pixel a different shade.
    const img = image(20, 10, (x, y) => {
      const n = (x * 10 + y) % 25;
      return x < 10 ? [220 + n, 10 + n, 10, 255] : [10, 10 + n, 220 + n, 255];
    });
    const out = extractPalette(img, 2);
    expect(out).toHaveLength(2);
    const reds = out.find((s) => hexRed(s.hex) > 150);
    const blues = out.find((s) => hexBlue(s.hex) > 150);
    expect(reds).toBeDefined();
    expect(blues).toBeDefined();
    expect(out.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 9);
    expect(reds!.share).toBeCloseTo(0.5, 2);
  });

  it('is deterministic for the same input', () => {
    const img = image(40, 40, (x, y) => [(x * 7) & 255, (y * 13) & 255, ((x * y) >> 2) & 255, 255]);
    expect(extractPalette(img, 8)).toEqual(extractPalette(img, 8));
  });

  it('downscales large pictures before analysis and still finds the dominant color', () => {
    const img = image(600, 300, (x) => (x < 400 ? [30, 90, 200, 255] : [250, 250, 250, 255]));
    const out = extractPalette(img, 3, 256);
    expect(out[0]).toMatchObject({ hex: '#1e5ac8' });
    expect(out[0]!.share).toBeCloseTo(400 / 600, 1);
  });
});

const hexRed = (hex: string) => parseInt(hex.slice(1, 3), 16);
const hexBlue = (hex: string) => parseInt(hex.slice(5, 7), 16);
