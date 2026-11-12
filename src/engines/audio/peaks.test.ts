import { describe, expect, it } from 'vitest';
import { computePeaks } from './peaks';

describe('computePeaks', () => {
  it('takes min and max per column across channels', () => {
    const p = computePeaks([Float32Array.from([0, 0.5, -1, 0.25]), Float32Array.from([0.1, -0.2, 0, 0.75])], 2);
    expect(Array.from(p.max)).toEqual([0.5, 0.75]);
    expect(p.min[0]).toBeCloseTo(-0.2, 6);
    expect(p.min[1]).toBe(-1);
  });
  it('never returns more columns than frames', () => {
    expect(computePeaks([Float32Array.from([0.3, -0.3])], 800).max.length).toBe(2);
  });
});
