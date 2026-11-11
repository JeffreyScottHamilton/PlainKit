import { describe, expect, it } from 'vitest';
import { MIME_TYPES } from '../data/mime-types';
import { extsForMime, mimeForExt, searchMime } from './mime-types';

describe('mime types', () => {
  it('has about 120 entries with unique extensions and valid MIME shapes', () => {
    expect(MIME_TYPES.length).toBeGreaterThanOrEqual(100);
    const exts = MIME_TYPES.map((e) => e.ext);
    expect(new Set(exts).size).toBe(exts.length);
    for (const e of MIME_TYPES) expect(e.mime).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
  });

  it('looks up both directions', () => {
    expect(mimeForExt('.JSON')).toBe('application/json');
    expect(mimeForExt('nope')).toBeUndefined();
    expect(extsForMime('image/jpeg; charset=x')).toEqual(['jpeg', 'jpg']);
    expect(searchMime('pdf').map((e) => e.ext)).toEqual(['pdf']);
  });
});
