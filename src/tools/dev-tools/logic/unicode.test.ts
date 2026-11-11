import { describe, expect, it } from 'vitest';
import { codePointRows, fromEscapes, toEscapes } from './unicode';

describe('unicode inspector', () => {
  it('lists code points with UTF-8 and UTF-16 units; ZWJ sequences are several rows', () => {
    const rows = codePointRows('‍');
    expect(rows).toEqual([{ char: '‍', cp: 0x200d, name: 'ZERO WIDTH JOINER', utf8: [0xe2, 0x80, 0x8d], utf16Units: [0x200d] }]);
    expect(codePointRows('👨‍👩‍👧')).toHaveLength(5);
  });

  it('escapes astral characters as surrogate pairs and as braces', () => {
    expect(toEscapes('😀', 'u4', 'all')).toBe('\\uD83D\\uDE00');
    expect(toEscapes('😀', 'brace', 'all')).toBe('\\u{1F600}');
    expect(toEscapes('aé', 'u4', 'non-ascii')).toBe('a\\u00E9');
  });

  it('decodes escapes and rejects malformed or lone surrogates', () => {
    expect(fromEscapes('\\u00e9\\u{1F600}\\uD83D\\uDE00')).toEqual({ ok: true, value: 'é😀😀' });
    const lone = fromEscapes('\\uD83Dx');
    expect(lone.ok).toBe(false);
    if (!lone.ok) expect(lone.error).toMatch(/Lone high surrogate/);
    expect(fromEscapes('\\n').ok).toBe(false);
  });
});
