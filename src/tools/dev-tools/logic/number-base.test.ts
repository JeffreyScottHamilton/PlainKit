import { describe, expect, it } from 'vitest';
import { formatInBase, parseInBase } from './number-base';

describe('number-base', () => {
  it('converts values above 2^53 exactly', () => {
    const r = parseInBase('9007199254740993', 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(9007199254740993n);
    expect(formatInBase(r.value, 16)).toBe('20000000000001');
    expect(formatInBase(r.value, 2)).toHaveLength(54);
  });
  it('handles base 36, negatives and prefixes', () => {
    expect(parseInBase('zz', 36)).toMatchObject({ ok: true, value: 1295n });
    expect(parseInBase('-ff', 16)).toMatchObject({ ok: true, value: -255n });
    expect(parseInBase('0xff', 16)).toMatchObject({ ok: true, value: 255n });
  });
  it('reports a digit that is invalid for the base', () => {
    expect(parseInBase('12', 2)).toEqual({ ok: false, message: '"2" is not a valid digit in base 2 (allowed: 0-1).' });
  });
});
