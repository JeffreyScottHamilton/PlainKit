import { describe, expect, it } from 'vitest';
import { reverseCodePoints, reverseGraphemes, reverseLines, reverseWords } from './reverse';

describe('reverse', () => {
  it('reverses by grapheme so a ZWJ family stays whole', () => {
    expect(reverseGraphemes('👨‍👩‍👧ab').output).toBe('ba👨‍👩‍👧');
  });

  it('code point fallback splits the ZWJ sequence', () => {
    expect(reverseCodePoints('ab👨')).toBe('👨ba');
  });

  it('reverses words and lines while keeping separators', () => {
    expect(reverseWords('one two  three')).toBe('three two  one');
    expect(reverseLines('a\nb\nc')).toBe('c\nb\na');
  });
});
