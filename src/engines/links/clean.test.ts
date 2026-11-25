import { describe, expect, it } from 'vitest';
import { cleanLine, cleanText, extractUrls } from './clean';

describe('cleanLine tracker removal', () => {
  it('removes utm params and keeps other params, fragment and order', () => {
    const r = cleanLine('https://ex.com/p?b=2&utm_source=x&a=1&utm_medium=y&c=3#sec-2', 1);
    expect(r.ok && r.cleaned).toBe('https://ex.com/p?b=2&a=1&c=3#sec-2');
    expect(r.ok && r.applied).toBe(true);
  });

  it('drops the "?" when every parameter is removed', () => {
    const r = cleanLine('https://ex.com/p?utm_source=x&fbclid=abc#top', 1);
    expect(r.ok && r.cleaned).toBe('https://ex.com/p#top');
  });

  it('handles duplicate keys: every tracker copy is a candidate, others stay', () => {
    const r = cleanLine('https://ex.com/?q=1&utm_source=a&q=2&utm_source=b', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates.map((c) => c.raw)).toEqual(['utm_source=a', 'utm_source=b']);
    expect(r.cleaned).toBe('https://ex.com/?q=1&q=2');
  });

  it('keeps encoded values byte-for-byte (no re-encoding of kept params)', () => {
    const raw = 'https://ex.com/s?q=a%20b+c&redirect=https%3A%2F%2Fx.org%2Fp%3Fk%3D1&utm_campaign=z&emoji=%F0%9F%98%80&tilde=%7e';
    const r = cleanLine(raw, 1);
    expect(r.ok && r.cleaned).toBe('https://ex.com/s?q=a%20b+c&redirect=https%3A%2F%2Fx.org%2Fp%3Fk%3D1&emoji=%F0%9F%98%80&tilde=%7e');
  });

  it('removes encoded tracker keys too (utm%5Fsource)', () => {
    const r = cleanLine('https://ex.com/?utm%5Fsource=a&k=v', 1);
    expect(r.ok && r.cleaned).toBe('https://ex.com/?k=v');
  });

  it('removes si only on youtube and spotify hosts', () => {
    const yt = cleanLine('https://youtu.be/abc?si=TRACK&t=10', 1);
    expect(yt.ok && yt.cleaned).toBe('https://youtu.be/abc?t=10');
    const other = cleanLine('https://ex.com/a?si=keepme', 1);
    expect(other.ok && other.cleaned).toBe('https://ex.com/a?si=keepme');
  });

  it('reports "Nothing to remove" state through an unchanged result', () => {
    const r = cleanLine('https://ex.com/a?b=1#x', 1);
    expect(r.ok && r.candidates.length).toBe(0);
    expect(r.ok && r.applied).toBe(false);
    expect(r.ok && r.cleaned).toBe('https://ex.com/a?b=1#x');
  });
});

describe('signed links', () => {
  const signed = 'https://bucket.s3.example.com/o.pdf?utm_source=mail&X-Amz-Signature=abc&X-Amz-Credential=c';

  it('flags signed links and leaves the URL untouched by default', () => {
    const r = cleanLine(signed, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.signed).toBe(true);
    expect(r.cleaned).toBe(signed);
    expect(r.applied).toBe(false);
    expect(r.candidates.map((c) => c.key)).toEqual(['utm_source']);
  });

  it('removes trackers only when "Clean anyway" is chosen', () => {
    const r = cleanLine(signed, 1, { cleanAnyway: true });
    expect(r.ok && r.cleaned).toBe('https://bucket.s3.example.com/o.pdf?X-Amz-Signature=abc&X-Amz-Credential=c');
  });

  it('detects SAS, Google and generic signature names', () => {
    for (const q of ['sv=2020&sig=x', 'se=2030&sp=r', 'hmac=1', 'X-Goog-Signature=2', 'Expires=1&Policy=2']) {
      const r = cleanLine(`https://ex.com/f?${q}&utm_source=a`, 1);
      expect(r.ok && r.signed, q).toBe(true);
    }
  });
});

describe('restore', () => {
  it('re-adds one removed parameter at its original position', () => {
    const raw = 'https://ex.com/?a=1&utm_source=x&b=2&fbclid=y';
    const first = cleanLine(raw, 1);
    expect(first.ok && first.cleaned).toBe('https://ex.com/?a=1&b=2');
    const fbIndex = first.ok ? first.candidates.find((c) => c.key === 'fbclid')!.index : -1;
    const r = cleanLine(raw, 1, { restored: new Set([fbIndex]) });
    expect(r.ok && r.cleaned).toBe('https://ex.com/?a=1&b=2&fbclid=y');
    expect(r.ok && r.applied).toBe(true);
  });

  it('restoring every candidate yields the original and applied=false', () => {
    const raw = 'https://ex.com/?utm_a=1&k=2';
    const first = cleanLine(raw, 1);
    const all = new Set(first.ok ? first.candidates.map((c) => c.index) : []);
    const r = cleanLine(raw, 1, { restored: all });
    expect(r.ok && r.cleaned).toBe(raw);
    expect(r.ok && r.applied).toBe(false);
  });
});

describe('invalid input and schemes', () => {
  it('reports invalid lines with their line number', () => {
    const results = cleanText('https://ex.com/?utm_a=1\nnot a url\n\nhttps://ok.example/');
    expect(results.map((r) => r.line)).toEqual([1, 2, 4]);
    expect(results[1]?.ok).toBe(false);
  });

  it('cleans non-http schemes as text and marks them as not linkable', () => {
    const r = cleanLine('mailto:someone@example.com?subject=hi&utm_source=x', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.httpLike).toBe(false);
    expect(r.scheme).toBe('mailto');
    expect(r.cleaned).toBe('mailto:someone@example.com?subject=hi');
  });

  it('keeps the trailing "?" of a url that had one', () => {
    const r = cleanLine('https://ex.com/?', 1);
    expect(r.ok && r.cleaned).toBe('https://ex.com/?');
  });
});

describe('redirect wrappers', () => {
  it('takes the real google.com/url destination and cleans it', () => {
    const r = cleanLine('https://www.google.com/url?sa=D&q=https%3A%2F%2Fex.com%2Fpost%3Futm_source%3Dx%26id%3D7&ust=1', 1);
    expect(r.ok && r.cleaned).toBe('https://ex.com/post?id=7');
    expect(r.ok && r.unwrappedFrom).toBe('www.google.com');
  });

  it('unwraps facebook l.php (u=), reddit out (url=) and youtube redirect (q=)', () => {
    const fb = cleanLine('https://l.facebook.com/l.php?u=https%3A%2F%2Fex.com%2Fa&h=AT0x', 1);
    const rd = cleanLine('https://out.reddit.com/t3_abc?url=https%3A%2F%2Fex.com%2Fb%3Ffbclid%3D1&token_v2=z', 1);
    const yt = cleanLine('https://www.youtube.com/redirect?q=https%3A%2F%2Fex.com%2Fc&v=1', 1);
    expect(fb.ok && fb.cleaned).toBe('https://ex.com/a');
    expect(rd.ok && rd.cleaned).toBe('https://ex.com/b');
    expect(yt.ok && yt.cleaned).toBe('https://ex.com/c');
  });

  it('keeps the wrapper when the target is not an http(s) URL', () => {
    const r = cleanLine('https://www.google.com/url?q=javascript%3Aalert(1)&utm_source=x', 1);
    expect(r.ok && r.unwrappedFrom).toBeNull();
    expect(r.ok && r.cleaned).toBe('https://www.google.com/url?q=javascript%3Aalert(1)');
  });

  it('does not treat other paths on google.com as redirects', () => {
    const r = cleanLine('https://www.google.com/search?q=https%3A%2F%2Fex.com', 1);
    expect(r.ok && r.unwrappedFrom).toBeNull();
    expect(r.ok && r.cleaned).toBe('https://www.google.com/search?q=https%3A%2F%2Fex.com');
  });

  it('applies restore choices to the destination parameters', () => {
    const raw = 'https://www.google.com/url?q=https%3A%2F%2Fex.com%2F%3Futm_medium%3Dy';
    const first = cleanLine(raw, 1);
    if (!first.ok) throw new Error('expected ok');
    expect(first.candidates.map((c) => c.key)).toEqual(['utm_medium']);
    const r = cleanLine(raw, 1, { restored: new Set([first.candidates[0]!.index]) });
    expect(r.ok && r.cleaned).toBe('https://ex.com/?utm_medium=y');
  });
});

describe('links inside text', () => {
  it('finds every link in a sentence, without the trailing punctuation', () => {
    const results = cleanText('Read https://ex.com/a?utm_source=x, then (see https://ex.org/b?fbclid=1).');
    expect(results.map((r) => (r.ok ? r.cleaned : r.input))).toEqual(['https://ex.com/a', 'https://ex.org/b']);
  });

  it('gives a bare www. link the https scheme', () => {
    expect(extractUrls('Visit www.example.com/x?gclid=1 today')).toEqual(['https://www.example.com/x?gclid=1']);
  });

  it('keeps a closing paren that belongs to the URL', () => {
    expect(extractUrls('see https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
  });

  it('still reports a line with no link as invalid', () => {
    const results = cleanText('just words here');
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(false);
  });

  it('returns no tokens for text without links and never loops on empty input', () => {
    expect(extractUrls('no links')).toEqual([]);
    expect(extractUrls('https://')).toEqual([]);
  });
});
