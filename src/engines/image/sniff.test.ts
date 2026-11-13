import { describe, expect, it } from 'vitest';
import { isAnimated, sniffImageMime } from './sniff';

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const pad = (...parts: number[][]) => {
  const out = parts.flat();
  while (out.length < 64) out.push(0);
  return new Uint8Array(out);
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const chunk = (type: string, len: number) => [...u32be(len), ...ascii(type), ...new Array<number>(len).fill(0), 0, 0, 0, 0];

describe('sniffImageMime', () => {
  it('detects each supported format by magic bytes', () => {
    expect(sniffImageMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageMime(pad(PNG_SIG))).toBe('image/png');
    expect(sniffImageMime(pad(ascii('RIFF'), [0, 0, 0, 0], ascii('WEBP')))).toBe('image/webp');
    expect(sniffImageMime(pad(ascii('GIF89a')))).toBe('image/gif');
    expect(sniffImageMime(pad(ascii('GIF87a')))).toBe('image/gif');
    expect(sniffImageMime(pad([0, 0, 0, 0x1c], ascii('ftypavif')))).toBe('image/avif');
    expect(sniffImageMime(pad([0, 0, 0, 0x1c], ascii('ftypavis')))).toBe('image/avif');
    expect(sniffImageMime(pad(ascii('BM'), u32le(54), [0, 0, 0, 0], u32le(54), u32le(40)))).toBe('image/bmp');
  });

  it('ignores the file name: unknown bytes are null', () => {
    expect(sniffImageMime(pad(ascii('<svg xmlns'))) ).toBeNull();
    expect(sniffImageMime(pad(ascii('%PDF-1.7')))).toBeNull();
    expect(sniffImageMime(pad(ascii('ftypheic'), [0, 0, 0, 0x18]))).toBeNull();
  });

  it('rejects corrupted or truncated signatures', () => {
    expect(sniffImageMime(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(sniffImageMime(bytes())).toBeNull();
    expect(sniffImageMime(pad(ascii('RIFF'), [0, 0, 0, 0], ascii('WAVE')))).toBeNull();
    expect(sniffImageMime(pad(ascii('BM')))).toBeNull();
  });

  it('does not treat text that starts with BM as a BMP', () => {
    expect(sniffImageMime(pad(ascii('BMW is a car brand and other text')))).toBeNull();
  });
});

describe('isAnimated', () => {
  it('reads the WebP VP8X animation flag', () => {
    const anim = pad(ascii('RIFF'), [0, 0, 0, 0], ascii('WEBP'), ascii('VP8X'), [10, 0, 0, 0], [0x02, 0, 0, 0]);
    const still = pad(ascii('RIFF'), [0, 0, 0, 0], ascii('WEBP'), ascii('VP8X'), [10, 0, 0, 0], [0x10, 0, 0, 0]);
    expect(isAnimated(anim, 'image/webp')).toBe(true);
    expect(isAnimated(still, 'image/webp')).toBe(false);
  });

  it('finds an acTL chunk before IDAT in PNG (APNG)', () => {
    const apng = pad(PNG_SIG, chunk('IHDR', 13), chunk('acTL', 8), chunk('IDAT', 4));
    const png = pad(PNG_SIG, chunk('IHDR', 13), chunk('IDAT', 4), chunk('acTL', 8));
    expect(isAnimated(apng, 'image/png')).toBe(true);
    expect(isAnimated(png, 'image/png')).toBe(false);
  });

  it('does not inspect GIF frames (always reported separately)', () => {
    expect(isAnimated(pad(ascii('GIF89a')), 'image/gif')).toBe(false);
  });
});

import { describe as d2, expect as e2, it as i2 } from 'vitest';
import { sniffImageMime as sniff2 } from './sniff';

const ftyp = (major: string, ...compat: string[]) => {
  const brands = [major, '\0\0\0\0', ...compat].join('');
  const size = 8 + brands.length;
  return new Uint8Array([0, 0, 0, size, ...'ftyp'.split('').map((c) => c.charCodeAt(0)), ...brands.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
};
d2('HEIF family sniffing', () => {
  i2('recognises iPhone HEIC by major brand', () => e2(sniff2(ftyp('heic', 'mif1', 'heic'))).toBe('image/heic'));
  i2('recognises generic mif1 with a heic compatible brand', () => e2(sniff2(ftyp('mif1', 'mif1', 'heic'))).toBe('image/heic'));
  i2('keeps AVIF as AVIF even with a generic major brand', () => e2(sniff2(ftyp('mif1', 'avif', 'miaf'))).toBe('image/avif'));
  i2('does not treat an MP4 video as HEIC', () => e2(sniff2(ftyp('isom', 'isom', 'mp42'))).toBeNull());
});
