import { describe, expect, it } from 'vitest';
import { bytesToBase64, decodeBase64Utf8, encodeBase64Utf8 } from './base64';

describe('base64', () => {
  it('round-trips emoji and non-Latin UTF-8', () => {
    const text = 'héllo 👋🏽 日本語 Привет 👨‍👩‍👧';
    const enc = encodeBase64Utf8(text, false);
    expect(decodeBase64Utf8(enc)).toEqual({ ok: true, text });
    expect(decodeBase64Utf8(encodeBase64Utf8(text, true))).toEqual({ ok: true, text });
  });
  it('uses the URL-safe alphabet and drops padding when asked', () => {
    const bytes = new Uint8Array([0xfb, 0xff]);
    expect(bytesToBase64(bytes, false)).toBe('+/8=');
    expect(bytesToBase64(bytes, true)).toBe('-_8');
  });
  it('rejects characters outside the alphabet', () => {
    const r = decodeBase64Utf8('ab$d');
    expect(r.ok).toBe(false);
  });
  it('rejects bytes that are not UTF-8', () => {
    const r = decodeBase64Utf8('/w==');
    expect(r.ok).toBe(false);
  });
});
