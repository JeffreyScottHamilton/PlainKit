import { describe, expect, it } from 'vitest';
import { inkBounds, whiteToTransparent } from './marks';

describe('whiteToTransparent', () => {
  it('makes paper white transparent, keeps dark ink opaque, fades the edge between', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 20, 20, 20, 255, 225, 225, 225, 255]);
    whiteToTransparent(px);
    expect(px[3]).toBe(0); // white
    expect(px[7]).toBe(255); // ink
    expect(px[11]).toBeGreaterThan(0);
    expect(px[11]).toBeLessThan(255); // light grey edge is partly transparent
  });
});

describe('inkBounds', () => {
  it('returns undefined for no ink and pads the bounds of the strokes', () => {
    expect(inkBounds([])).toBeUndefined();
    expect(
      inkBounds(
        [
          [
            { x: 10, y: 20 },
            { x: 50, y: 60 },
          ],
        ],
        5,
      ),
    ).toEqual({ x0: 5, y0: 15, x1: 55, y1: 65 });
  });
});
