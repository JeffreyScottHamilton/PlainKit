import { describe, expect, it } from 'vitest';
import { WORDS } from '../data/words';
import { generatePassphrase } from './passphrase';

const opts = { words: 4, separator: '-', capitalize: false, addNumber: false };

describe('passphrase word list', () => {
  it('has at least 1024 unique lowercase words of 3 to 8 letters', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(1024);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,8}$/);
  });
});

describe('passphrase generator', () => {
  it('builds the phrase and computes entropy from the real list length', () => {
    const r = generatePassphrase({ ...opts, capitalize: true, addNumber: true });
    const parts = r.phrase.split('-');
    expect(parts).toHaveLength(5);
    expect(parts[0]![0]).toBe(parts[0]![0]!.toUpperCase());
    expect(r.listSize).toBe(WORDS.length);
    expect(r.entropyBits).toBeCloseTo(4 * Math.log2(WORDS.length) + Math.log2(100), 6);
  });

  it('keeps every random index in bounds over 10k draws (no out-of-range picks)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const r = generatePassphrase({ ...opts, words: 3 });
      for (const w of r.phrase.split('-')) {
        expect(WORDS).toContain(w);
        seen.add(w);
      }
    }
    expect(seen.size).toBeGreaterThan(WORDS.length * 0.9);
  });

  it('rejects word counts outside 3 to 12', () => {
    expect(() => generatePassphrase({ ...opts, words: 2 })).toThrow(RangeError);
    expect(() => generatePassphrase({ ...opts, words: 13 })).toThrow(RangeError);
  });
});
