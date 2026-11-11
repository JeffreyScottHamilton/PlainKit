import { describe, expect, it } from 'vitest';
import { searchQualityForTarget } from './search';

// Size grows linearly with quality: 100 bytes at q=0, 1100 at q=1.
const fake = (calls: number[]) => async (q: number) => {
  calls.push(q);
  const size = Math.round(100 + 1000 * q);
  return { size, value: `q${q}` };
};

describe('searchQualityForTarget', () => {
  it('finds the highest quality that fits the target', async () => {
    const calls: number[] = [];
    const r = await searchQualityForTarget({ targetBytes: 600, encode: fake(calls) });
    expect(r.targetMet).toBe(true);
    expect(r.best.size).toBeLessThanOrEqual(600);
    expect(r.best.quality).toBeGreaterThan(0.45);
    expect(r.best.quality).toBeLessThanOrEqual(0.5);
    expect(calls.length).toBe(r.encodes);
  });

  it('reports unmet with the smallest achieved output when even the lowest quality is too large', async () => {
    const calls: number[] = [];
    const r = await searchQualityForTarget({ targetBytes: 50, encode: fake(calls) });
    expect(r.targetMet).toBe(false);
    expect(r.best.quality).toBe(0.05);
    expect(r.best.size).toBe(150);
    expect(r.encodes).toBe(1);
  });

  it('returns the highest quality after two encodes when everything fits', async () => {
    const calls: number[] = [];
    const r = await searchQualityForTarget({ targetBytes: 10_000, encode: fake(calls) });
    expect(r.targetMet).toBe(true);
    expect(r.best.quality).toBe(0.95);
    expect(r.encodes).toBe(2);
  });

  it('never exceeds the encode budget, even with a non-monotonic encoder', async () => {
    let n = 0;
    const r = await searchQualityForTarget({
      targetBytes: 700,
      encode: async () => {
        n++;
        return { size: n % 2 === 0 ? 900 : 400, value: n };
      },
      maxEncodes: 8,
    });
    expect(n).toBeLessThanOrEqual(8);
    expect(r.encodes).toBe(n);
    expect(r.encodes).toBeLessThanOrEqual(8);
  });

  it('reports progress as encodes divided by the budget', async () => {
    const fractions: number[] = [];
    await searchQualityForTarget({ targetBytes: 600, encode: fake([]), onProgress: (f) => fractions.push(f) });
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions[0]).toBeCloseTo(1 / 8);
    fractions.forEach((f, i) => expect(f).toBeCloseTo((i + 1) / 8));
    expect(Math.max(...fractions)).toBeLessThanOrEqual(1);
  });

  it('rejects an invalid budget or target', async () => {
    await expect(searchQualityForTarget({ targetBytes: 0, encode: fake([]) })).rejects.toThrow(RangeError);
    await expect(searchQualityForTarget({ targetBytes: 10, encode: fake([]), maxEncodes: 1 })).rejects.toThrow(RangeError);
  });
});
