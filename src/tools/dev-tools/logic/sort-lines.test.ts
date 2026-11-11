import { describe, expect, it } from 'vitest';
import { randomInt, shuffleInPlace, sortLines, type SortOptions } from './sort-lines';

const base: SortOptions = { order: 'asc', caseInsensitive: false, natural: false, unique: false, removeEmpty: false, reverse: false, shuffle: false };

describe('sort-lines', () => {
  it('sorts naturally so a10 comes after a2', () => {
    expect(sortLines('a10\na2\na1', { ...base, natural: true }).output).toBe('a1\na2\na10');
    expect(sortLines('a10\na2\na1', base).output).toBe('a1\na10\na2');
  });

  it('dedupes case-insensitively and removes empty lines', () => {
    const r = sortLines('b\n\nB\na\n  \n', { ...base, caseInsensitive: true, unique: true, removeEmpty: true });
    expect(r.output).toBe('a\nb');
    expect(r.inCount).toBe(5);
    expect(r.outCount).toBe(2);
  });

  it('shuffle keeps the same multiset of lines with a deterministic source', () => {
    let i = 0;
    const src = () => [7, 3, 9, 1, 0, 5][i++ % 6]! * 1000003;
    const out = sortLines('1\n2\n3\n4\n5', { ...base, order: 'keep', shuffle: true }, src).output.split('\n');
    expect([...out].sort()).toEqual(['1', '2', '3', '4', '5']);
    expect(shuffleInPlace(['x'], src)).toEqual(['x']);
  });
});

describe('randomInt', () => {
  it('rejects biased draws and stays in bounds over 10k draws', () => {
    // First draw is above the rejection limit for n=3 and must be discarded.
    const src = (() => {
      const seq = [0xffffffff, 4, 8];
      let k = 0;
      return () => seq[k++] ?? 0;
    })();
    expect(randomInt(3, src)).toBe(1);
    const counts = [0, 0, 0];
    for (let k = 0; k < 10000; k++) {
      const v = randomInt(3);
      expect(v >= 0 && v < 3).toBe(true);
      counts[v]!++;
    }
    expect(counts.every((c) => c > 2800 && c < 3900)).toBe(true);
  });
});
