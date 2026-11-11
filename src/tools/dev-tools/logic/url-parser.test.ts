import { describe, expect, it } from 'vitest';
import { parseUrl } from './url-parser';

describe('parseUrl', () => {
  it('splits parts and keeps duplicate params in order', () => {
    const r = parseUrl('https://user@example.com:8443/a/b?x=1&x=2&name=a+b%21#top');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parts.protocol).toBe('https:');
    expect(r.parts.hostname).toBe('example.com');
    expect(r.parts.port).toBe('8443');
    expect(r.parts.pathname).toBe('/a/b');
    expect(r.parts.hash).toBe('#top');
    expect(r.parts.params).toEqual([
      { key: 'x', value: '1' },
      { key: 'x', value: '2' },
      { key: 'name', value: 'a b!' },
    ]);
  });

  it('reports invalid input without throwing', () => {
    const r = parseUrl('example.com/no-scheme');
    expect(r).toEqual({ ok: false, error: 'Not a valid absolute URL. Include a scheme such as https:// or mailto:.' });
    expect(parseUrl('   ')).toEqual({ ok: false, error: 'Enter a URL to parse.' });
  });

  it('parses non-http schemes as text parts', () => {
    const r = parseUrl('javascript:alert(1)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parts.protocol).toBe('javascript:');
  });
});
