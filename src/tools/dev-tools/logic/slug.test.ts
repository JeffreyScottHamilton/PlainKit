import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

const base = { separator: '-' as const, maxLength: null, keepNonLatin: false };

describe('slug', () => {
  it('strips diacritics and punctuation', () => {
    expect(slugify('Crème Brûlée — 2026!', base)).toEqual({ ok: true, slug: 'creme-brulee-2026' });
    expect(slugify('Straße', base)).toEqual({ ok: true, slug: 'strasse' });
  });
  it('uses the chosen separator and truncates without a trailing separator', () => {
    expect(slugify('Hello World Foo', { ...base, separator: '_' })).toEqual({ ok: true, slug: 'hello_world_foo' });
    expect(slugify('Hello World Foo', { ...base, maxLength: 8 })).toEqual({ ok: true, slug: 'hello-wo' });
    expect(slugify('Hello World Foo', { ...base, maxLength: 6 })).toEqual({ ok: true, slug: 'hello' });
  });
  it('keeps non-Latin letters only when asked, and reports empty results', () => {
    expect(slugify('Привет мир', { ...base, keepNonLatin: true })).toEqual({ ok: true, slug: 'привет-мир' });
    const empty = slugify('Привет мир', base);
    expect(empty.ok).toBe(false);
  });
  it('rejects an invalid max length', () => {
    expect(slugify('a', { ...base, maxLength: 0 }).ok).toBe(false);
  });
});
