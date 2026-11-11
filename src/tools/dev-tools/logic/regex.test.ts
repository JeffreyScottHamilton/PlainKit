import { describe, expect, it } from 'vitest';
import { compileRegex, REGEX_DISPLAY_CAP, runRegex } from './regex';

describe('regex', () => {
  it('returns matches with index, groups and named groups', () => {
    const r = runRegex({ pattern: '(\\d+)-(?<w>\\w)', flags: '', text: '12-a 3-b' });
    expect(r.count).toBe(2);
    expect(r.matches[0]).toEqual({ index: 0, match: '12-a', groups: ['12', 'a'], named: { w: 'a' } });
  });
  it('caps displayed matches and says so', () => {
    const r = runRegex({ pattern: 'a', flags: '', text: 'a'.repeat(REGEX_DISPLAY_CAP + 100) });
    expect(r.count).toBe(REGEX_DISPLAY_CAP + 100);
    expect(r.matches).toHaveLength(REGEX_DISPLAY_CAP);
    expect(r.truncated).toBe(true);
  });
  it('finds zero-length matches without looping forever', () => {
    expect(runRegex({ pattern: 'x*', flags: '', text: 'ab' }).count).toBe(3);
  });
  it('reports an invalid pattern as text', () => {
    const r = compileRegex('(', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/^Invalid pattern:/);
  });
});
