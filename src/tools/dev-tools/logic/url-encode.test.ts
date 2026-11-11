import { describe, expect, it } from 'vitest';
import { urlDecode, urlEncode } from './url-encode';

describe('url-encode', () => {
  it('encodes with component and full-URI rules', () => {
    expect(urlEncode('a b&c/é', 'component')).toEqual({ ok: true, text: 'a%20b%26c%2F%C3%A9' });
    expect(urlEncode('a b&c/é', 'uri')).toEqual({ ok: true, text: 'a%20b&c/%C3%A9' });
  });
  it('decodes percent sequences', () => {
    expect(urlDecode('%E6%97%A5%20x', 'component')).toEqual({ ok: true, text: '日 x' });
  });
  it('reports malformed sequences', () => {
    const r = urlDecode('%E0%A4%A', 'component');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Malformed percent-encoding');
  });
});
