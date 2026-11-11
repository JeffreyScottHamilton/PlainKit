import { describe, expect, it } from 'vitest';
import { textStats } from './text-stats';

// family emoji (ZWJ sequence) + space + precomposed e-acute
const SAMPLE = '\u{1F468}‍\u{1F469}‍\u{1F467} é';

describe('text-stats', () => {
  it('counts UTF-16 units, code points, graphemes and UTF-8 bytes separately', () => {
    const s = textStats(SAMPLE);
    expect(s.utf16).toBe(10);
    expect(s.codePoints).toBe(7);
    expect(s.graphemes).toBe(3);
    expect(s.utf8Bytes).toBe(21);
  });
  it('counts words, lines and paragraphs', () => {
    expect(textStats('one two\nthree\n\nfour')).toMatchObject({ words: 4, lines: 4, paragraphs: 2 });
    expect(textStats('')).toMatchObject({ words: 0, lines: 0, paragraphs: 0 });
  });
});
