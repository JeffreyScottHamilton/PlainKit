import { describe, expect, it } from 'vitest';
import { decodeEntities, encodeEntities } from './html-entities';

describe('html-entities', () => {
  it('escapes markup characters', () => {
    expect(encodeEntities(`<a href="x">&'</a>`, false)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
  it('encodes non-ASCII as numeric references when asked', () => {
    expect(encodeEntities('é😀', true)).toBe('&#233;&#128512;');
  });
  it('decodes numeric and named entities once, reporting invalid and unknown ones', () => {
    const r = decodeEntities('&amp;lt; &#x1F600; &copy; &#xD800; &bogus;');
    expect(r.text).toBe('&lt; 😀 © &#xD800; &bogus;');
    expect(r.decoded).toBe(3);
    expect(r.invalid).toEqual(['&#xD800;']);
    expect(r.unknown).toEqual(['&bogus;']);
  });
});
