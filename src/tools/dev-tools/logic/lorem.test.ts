import { describe, expect, it } from 'vitest';
import { generateLorem } from './lorem';

describe('lorem', () => {
  it('starts with the classic opening when asked', () => {
    const r = generateLorem('paragraphs', 3, true);
    expect(r.ok && r.text.split('\n\n')).toHaveLength(3);
    expect(r.ok && r.text.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit.')).toBe(true);
  });
  it('produces exactly the requested word count', () => {
    const r = generateLorem('words', 25, false);
    expect(r.ok && r.text.split(' ')).toHaveLength(25);
  });
  it('is deterministic for the same options', () => {
    expect(generateLorem('sentences', 4, true)).toEqual(generateLorem('sentences', 4, true));
  });
  it('rejects counts outside the limit', () => {
    expect(generateLorem('words', 0, false)).toEqual({ ok: false, message: 'words must be a whole number from 1 to 2000.' });
  });
});
