import { describe, expect, it } from 'vitest';
import { CLASSES, entropyBits, generatePassword, type PwOptions, unbiasedInt, validatePassword } from './password';

const ALL: PwOptions = { length: 12, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false };

describe('password', () => {
  it('samples uniformly within range over 10k draws for several maxima', () => {
    for (const max of [1, 2, 3, 7, 62, 95]) {
      const seen = new Set<number>();
      for (let i = 0; i < 10_000; i++) {
        const v = unbiasedInt(max);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(max);
        seen.add(v);
      }
      expect(seen.size).toBe(max);
    }
  });
  it('rejects draws above the unbiased limit instead of taking modulo', () => {
    // For max 3 the limit is 2^32 - 1; 4294967295 must be rejected, 4294967294 % 3 = 2 is used.
    const draws = [4294967295, 4294967294];
    const fill = (buf: Uint32Array) => {
      buf[0] = draws.shift() ?? 0;
    };
    expect(unbiasedInt(3, fill)).toBe(2);
  });
  it('includes at least one character from each selected class', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword({ ...ALL, length: 8 });
      expect(p).toHaveLength(8);
      for (const c of ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', CLASSES.symbols]) {
        expect([...p].some((ch) => c.includes(ch))).toBe(true);
      }
    }
  });
  it('estimates entropy as length times log2 of the pool, and validates options', () => {
    const bits = entropyBits({ length: 8, lower: true, upper: false, digits: false, symbols: false, excludeAmbiguous: false });
    expect(bits).toBeCloseTo(8 * Math.log2(26), 6);
    expect(validatePassword({ ...ALL, length: 3 })).toBe('Length must be a whole number from 4 to 128.');
    expect(validatePassword({ ...ALL, lower: false, upper: false, digits: false, symbols: false })).toBe('Select at least one character type.');
  });
});
