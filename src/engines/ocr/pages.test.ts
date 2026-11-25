import { describe, expect, it } from 'vitest';
import { parsePageSpec } from './pages';

describe('parsePageSpec', () => {
  it('defaults blank and "all" to every page', () => {
    expect(parsePageSpec('', 3)).toEqual({ ok: true, pages: [1, 2, 3] });
    expect(parsePageSpec(' ALL ', 2)).toEqual({ ok: true, pages: [1, 2] });
  });

  it('parses singles, ranges and open ranges, sorted and de-duplicated', () => {
    expect(parsePageSpec('5, 1-3, 2, 8-', 9)).toEqual({ ok: true, pages: [1, 2, 3, 5, 8, 9] });
    expect(parsePageSpec('-2', 4)).toEqual({ ok: true, pages: [1, 2] });
  });

  it('rejects out-of-range, backwards and malformed input with a message', () => {
    const range = parsePageSpec('4', 3);
    expect(range).toEqual({ ok: false, message: 'Pages must be between 1 and 3.' });
    expect(parsePageSpec('3-1', 5).ok).toBe(false);
    expect(parsePageSpec('abc', 5).ok).toBe(false);
    expect(parsePageSpec('-', 5).ok).toBe(true);
  });

  it('reports a PDF with no pages', () => {
    expect(parsePageSpec('', 0)).toEqual({ ok: false, message: 'This PDF has no pages.' });
  });
});
