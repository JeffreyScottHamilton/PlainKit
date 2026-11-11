import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { escapeVcard, escapeWifi, payloadFor, vcardPayload, wifiPayload } from './payload';
import { logoLayout, makeMatrix, renderPixels, type Ecc } from './render';
import { colorWarnings, contrastRatio, parseHex, readBack } from './check';

const BLACK = [0, 0, 0] as const;
const WHITE = [255, 255, 255] as const;

/** Full path under test: encode, render to pixels, decode with an independent decoder. */
function roundTrip(text: string, ecc: Ecc = 'M', px = 480, margin = 4): string | null {
  const m = makeMatrix(text, ecc);
  const rgba = renderPixels(m, { px, margin, dark: [...BLACK], light: [...WHITE] });
  return readBack(rgba, px, px);
}

describe('round trip through jsQR', () => {
  it('decodes a URL exactly', () => {
    const url = 'https://example.org/docs/page?lang=en&q=a%20b#top';
    expect(roundTrip(url)).toBe(url);
  });

  it('decodes UTF-8 text with emoji and non-Latin scripts', () => {
    const text = 'Привет, 世界 🌍 مرحبا';
    expect(roundTrip(text, 'Q')).toBe(text);
  });

  it('decodes a Wi-Fi string with reserved characters', () => {
    const payload = wifiPayload({ kind: 'wifi', ssid: 'Cafe;Net,"A":1\\', password: 'p@ss;w\\rd,1:"x"', security: 'WPA', hidden: false });
    expect(roundTrip(payload, 'H')).toBe(payload);
  });

  it('decodes a vCard', () => {
    const payload = vcardPayload({ kind: 'vcard', name: 'Ada Lovelace', phone: '+44 20 7946 0000', email: 'ada@example.org', org: 'Analytical; Engines', url: 'https://example.org' });
    expect(roundTrip(payload, 'M')).toBe(payload);
  });
});

describe('escaping', () => {
  it('escapes backslash, semicolon, comma, colon and double quote in Wi-Fi fields', () => {
    expect(escapeWifi('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f');
  });

  it('builds the Wi-Fi string with the expected layout', () => {
    expect(wifiPayload({ kind: 'wifi', ssid: 'Home', password: 'pw;1', security: 'WPA', hidden: true })).toBe('WIFI:T:WPA;S:Home;P:pw\\;1;H:true;;');
  });

  it('omits the password for open networks', () => {
    expect(wifiPayload({ kind: 'wifi', ssid: 'Guest', password: '', security: 'nopass', hidden: false })).toBe('WIFI:T:nopass;S:Guest;H:false;;');
  });

  it('escapes vCard values and produces a 3.0 card', () => {
    expect(escapeVcard('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const v = vcardPayload({ kind: 'vcard', name: 'Ada', phone: '', email: 'a@b.c', org: '', url: '' });
    expect(v.split('\r\n')).toEqual(['BEGIN:VCARD', 'VERSION:3.0', 'N:Ada;;;;', 'FN:Ada', 'EMAIL:a@b.c', 'END:VCARD']);
  });

  it('returns null for empty content', () => {
    expect(payloadFor({ kind: 'text', text: '' })).toBeNull();
    expect(payloadFor({ kind: 'vcard', name: '  ', phone: '1', email: '', org: '', url: '' })).toBeNull();
  });
});

describe('contrast', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });

  it('warns below 4:1 and when the code is lighter than the background', () => {
    const low = colorWarnings([200, 200, 200], [255, 255, 255]);
    expect(low.some((m) => m.includes('at least 4:1'))).toBe(true);
    expect(low.some((m) => m.includes('dark modules on a light background'))).toBe(false);
    const inverted = colorWarnings([255, 255, 255], [0, 0, 0]);
    expect(inverted.some((m) => m.includes('dark modules on a light background'))).toBe(true);
    expect(colorWarnings([0, 0, 0], [255, 255, 255])).toEqual([]);
  });

  it('parses hex colors', () => {
    expect(parseHex('#1a2B3c')).toEqual([0x1a, 0x2b, 0x3c]);
    expect(parseHex('nope')).toBeNull();
  });
});

describe('overflow and logo layout', () => {
  it('reports overflow as a clear ToolError', () => {
    const huge = 'x'.repeat(3000);
    try {
      makeMatrix(huge, 'H');
      expect.unreachable('should overflow');
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).message).toBe('Too much content for a QR code at this correction level.');
    }
  });

  it('caps the logo at 30% of the width', () => {
    const l = logoLayout(1000, 2000, 500);
    expect(l.w).toBe(300);
    expect(l.h).toBe(75);
    expect(l.coverage).toBeLessThan(0.2);
  });
});
