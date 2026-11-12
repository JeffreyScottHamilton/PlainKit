import { describe, expect, it } from 'vitest';
import { classifyResponse, fileNameFor, isPlatformHost, validateLink } from './link';

describe('validateLink', () => {
  it('accepts https links', () => {
    const r = validateLink('https://media.test/a/clip.webm?x=1');
    expect(r.ok && r.url.href).toBe('https://media.test/a/clip.webm?x=1');
  });

  it('rejects http and other schemes', () => {
    for (const raw of ['http://media.test/a.mp4', 'file:///etc/passwd', 'blob:https://x/1', 'javascript:alert(1)']) {
      const r = validateLink(raw);
      expect(r, raw).toMatchObject({ ok: false, kind: 'scheme' });
    }
  });

  it('rejects credentials in the URL', () => {
    expect(validateLink('https://user:pw@media.test/a.mp4')).toMatchObject({ ok: false, kind: 'credentials' });
    expect(validateLink('https://user@media.test/a.mp4')).toMatchObject({ ok: false, kind: 'credentials' });
  });

  it('detects platform hosts, including subdomains, and does not extract', () => {
    expect(validateLink('https://www.youtube.com/watch?v=abc')).toMatchObject({ ok: false, kind: 'platform' });
    expect(validateLink('https://youtu.be/abc')).toMatchObject({ ok: false, kind: 'platform' });
    expect(validateLink('https://m.tiktok.com/@a/video/1')).toMatchObject({ ok: false, kind: 'platform' });
    expect(isPlatformHost('notyoutube.com')).toBe(false);
  });

  it('reports invalid and empty input', () => {
    expect(validateLink('not a url')).toMatchObject({ ok: false, kind: 'invalid' });
    expect(validateLink('   ')).toMatchObject({ ok: false, kind: 'empty' });
  });
});

describe('classifyResponse', () => {
  it('accepts video, audio and HLS types', () => {
    expect(classifyResponse('video/webm; codecs=vp8', '/a')).toEqual({ kind: 'media', mime: 'video/webm' });
    expect(classifyResponse('audio/mpeg', '/a')).toEqual({ kind: 'media', mime: 'audio/mpeg' });
    expect(classifyResponse('application/vnd.apple.mpegurl', '/a')).toEqual({ kind: 'hls' });
  });

  it('accepts octet-stream only with a media extension', () => {
    expect(classifyResponse('application/octet-stream', '/clip.mp4')).toEqual({ kind: 'media', mime: 'video/mp4' });
    expect(classifyResponse('application/octet-stream', '/clip.bin').kind).toBe('rejected');
  });

  it('rejects HTML and other types', () => {
    expect(classifyResponse('text/html; charset=utf-8', '/watch').kind).toBe('rejected');
  });
});

describe('fileNameFor', () => {
  it('uses the last path segment, decoded and sanitized, with an extension from the MIME type', () => {
    expect(fileNameFor(new URL('https://a.test/x/my%20clip.webm'), 'video/webm')).toBe('my clip.webm');
    expect(fileNameFor(new URL('https://a.test/x/'), 'video/mp4')).toBe('download.mp4');
    expect(fileNameFor(new URL('https://a.test/a:b*c'), 'video/mp4')).not.toMatch(/[:*]/);
  });
});
