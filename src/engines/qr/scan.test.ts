import { describe, expect, it } from 'vitest';
import { makeMatrix, renderPixels } from './render';
import { decodePixels, decodeRobust, fitWithin, SCAN_MAX_SIDE, type Pixels } from './scan';

const url = 'https://example.org/a?utm_source=x';

function pixels(text: string, px: number, dark: [number, number, number], light: [number, number, number]): Pixels {
  const data = renderPixels(makeMatrix(text, 'M'), { px, margin: 4, dark, light });
  return { data, width: px, height: px };
}

describe('decodeRobust', () => {
  it('reads a dark-on-light code as it is', () => {
    expect(decodeRobust(pixels(url, 480, [0, 0, 0], [255, 255, 255]))).toBe(url);
  });

  it('reads a light-on-dark code through the inverted pass', () => {
    expect(decodePixels(pixels(url, 480, [255, 255, 255], [0, 0, 0]))).toBe(url);
    expect(decodeRobust(pixels(url, 480, [255, 255, 255], [0, 0, 0]))).toBe(url);
  });

  it('returns null when there is no code', () => {
    const blank: Pixels = { data: new Uint8ClampedArray(300 * 300 * 4).fill(255), width: 300, height: 300 };
    expect(decodeRobust(blank)).toBeNull();
  });
});

describe('fitWithin', () => {
  it('leaves an image that already fits untouched', () => {
    const p = pixels(url, 400, [0, 0, 0], [255, 255, 255]);
    expect(fitWithin(p, SCAN_MAX_SIDE)).toBe(p);
  });

  it('scales the longest side down and keeps the aspect ratio', () => {
    const p: Pixels = { data: new Uint8ClampedArray(2400 * 1200 * 4).fill(255), width: 2400, height: 1200 };
    const s = fitWithin(p, SCAN_MAX_SIDE);
    expect([s.width, s.height]).toEqual([1600, 800]);
    expect(s.data.length).toBe(1600 * 800 * 4);
  });

  it('keeps a code readable after a large image is scaled down', () => {
    const big = pixels(url, 2400, [0, 0, 0], [255, 255, 255]);
    expect(decodePixels(fitWithin(big, SCAN_MAX_SIDE))).toBe(url);
    expect(decodeRobust(big)).toBe(url);
  });
});
