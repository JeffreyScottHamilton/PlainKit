import { describe, expect, it } from 'vitest';
import { escapeText, unescapeText } from './escape';

describe('escape', () => {
  it('round-trips JSON strings with quotes and newlines', () => {
    const src = 'say "hi"\nC:\\tmp';
    const esc = escapeText('json', src);
    expect(esc).toBe('say \\"hi\\"\\nC:\\\\tmp');
    expect(unescapeText('json', esc)).toEqual({ ok: true, value: src });
  });

  it('escapes JS quotes and control characters and decodes \\u escapes', () => {
    expect(escapeText('js', "it's\t")).toBe("it\\'s\\t");
    expect(unescapeText('js', '\\u0041\\x42\\u{1F600}')).toEqual({ ok: true, value: 'AB\u{1F600}' });
  });

  it('escapes regex specials and reports a malformed escape', () => {
    expect(escapeText('regex', 'a.b*(c)')).toBe('a\\.b\\*\\(c\\)');
    const bad = unescapeText('js', 'x\\u12');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/Incomplete \\u escape at position 2/);
    expect(unescapeText('json', 'bad "quote"').ok).toBe(false);
  });
});
