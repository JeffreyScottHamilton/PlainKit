import { describe, expect, it } from 'vitest';
import { decodeTiff, encodeBmp, encodeGif, encodeTiff, sniffExtra, wrapIco, type Rgba } from './extra';

function img(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { data, width: w, height: h };
}
const quad = img(4, 3, (x, y) => (x < 2 ? [255, 0, 0, 255] : y === 0 ? [0, 255, 0, 255] : [0, 0, 255, 255]));

describe('extra image encoders', () => {
  it('writes a BMP with the right header, padding and bottom-up BGR rows', () => {
    const bmp = encodeBmp(quad);
    const dv = new DataView(bmp.buffer);
    expect(sniffExtra(bmp)).toBe('image/bmp');
    expect(bmp.length).toBe(54 + 12 * 3);
    expect([dv.getInt32(18, true), dv.getInt32(22, true), dv.getUint16(28, true)]).toEqual([4, 3, 24]);
    // The last stored row is the top image row: red (BGR 0,0,255) then green.
    const top = 54 + 2 * 12;
    expect([...bmp.subarray(top, top + 3)]).toEqual([0, 0, 255]);
    expect([...bmp.subarray(top + 6, top + 9)]).toEqual([0, 255, 0]);
  });
  it('round-trips a TIFF exactly', () => {
    const tiff = encodeTiff(quad);
    expect(sniffExtra(tiff)).toBe('image/tiff');
    const back = decodeTiff(tiff.buffer.slice(tiff.byteOffset, tiff.byteOffset + tiff.byteLength) as ArrayBuffer);
    expect([back.width, back.height]).toEqual([4, 3]);
    expect([...back.data]).toEqual([...quad.data]);
  });
  it('writes a GIF with the right size, and marks transparency when the image has it', () => {
    const gif = encodeGif(quad);
    expect(new TextDecoder().decode(gif.subarray(0, 6))).toBe('GIF89a');
    expect([gif[6]! | (gif[7]! << 8), gif[8]! | (gif[9]! << 8)]).toEqual([4, 3]);
    const clear = encodeGif(img(4, 4, (x) => (x < 2 ? [0, 0, 0, 0] : [10, 200, 30, 255])));
    // A graphic control extension (21 F9 04) with the transparency flag set.
    const i = clear.findIndex((b, k) => b === 0x21 && clear[k + 1] === 0xf9 && clear[k + 2] === 4);
    expect(i).toBeGreaterThan(0);
    expect(clear[i + 3]! & 1).toBe(1);
  });
  it('wraps a PNG in an ICO directory and refuses oversized icons', () => {
    const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 1, 2, 3);
    const ico = wrapIco(png, 256, 32);
    expect(sniffExtra(ico)).toBe('image/x-icon');
    expect([ico[6], ico[7]]).toEqual([0, 32]);
    expect(new DataView(ico.buffer).getUint32(14, true)).toBe(png.length);
    expect([...ico.subarray(22)]).toEqual([...png]);
    expect(() => wrapIco(png, 300, 10)).toThrow(/256/);
  });
  it('rejects junk as TIFF', () => {
    expect(() => decodeTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer)).toThrow();
  });
});
