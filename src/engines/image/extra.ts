import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import * as UTIF from 'utif2';

// Extra still-image outputs the browser canvas cannot write itself. Pure functions over RGBA pixels, so they are
// unit-testable; the worker wraps them.
export type ExtraMime = 'image/gif' | 'image/bmp' | 'image/x-icon' | 'image/tiff' | 'image/avif';
export const EXTRA_MIMES: readonly ExtraMime[] = ['image/gif', 'image/bmp', 'image/x-icon', 'image/tiff', 'image/avif'];
export const ICO_SIZES = [16, 32, 48, 64, 128, 256] as const;
export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

/** Single-frame GIF: at most 256 colours, and transparency is on/off only. */
export function encodeGif(img: Rgba): Uint8Array {
  let transparent = false;
  for (let i = 3; i < img.data.length; i += 4)
    if (img.data[i]! < 128) {
      transparent = true;
      break;
    }
  const format = transparent ? 'rgba4444' : 'rgb565';
  const palette = quantize(img.data, 256, { format, oneBitAlpha: transparent });
  const index = applyPalette(img.data, palette, format);
  const gif = GIFEncoder();
  const transparentIndex = transparent ? palette.findIndex((p) => p[3] === 0) : -1;
  gif.writeFrame(index, img.width, img.height, { palette, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex) });
  gif.finish();
  return gif.bytes();
}

/** 24-bit uncompressed BMP. No transparency: pixels must already be flattened onto a background. */
export function encodeBmp(img: Rgba): Uint8Array {
  const row = Math.ceil((img.width * 3) / 4) * 4;
  const size = 54 + row * img.height;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, img.width, true);
  dv.setInt32(22, img.height, true); // positive height: rows are stored bottom-up
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, row * img.height, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < img.height; y++) {
    let o = 54 + (img.height - 1 - y) * row;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      out[o++] = img.data[i + 2]!;
      out[o++] = img.data[i + 1]!;
      out[o++] = img.data[i]!;
    }
  }
  return out;
}

/** ICO holding one PNG image (the modern form, read by Windows Vista and later and by every browser). */
export function wrapIco(png: Uint8Array, width: number, height: number): Uint8Array {
  if (width > 256 || height > 256) throw new Error('ICO images are at most 256 pixels.');
  const out = new Uint8Array(22 + png.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(2, 1, true); // type: icon
  dv.setUint16(4, 1, true); // one image
  out[6] = width === 256 ? 0 : width;
  out[7] = height === 256 ? 0 : height;
  dv.setUint16(10, 1, true);
  dv.setUint16(12, 32, true);
  dv.setUint32(14, png.length, true);
  dv.setUint32(18, 22, true);
  out.set(png, 22);
  return out;
}

/** Uncompressed RGBA TIFF. */
export function encodeTiff(img: Rgba): Uint8Array {
  return new Uint8Array(UTIF.encodeImage(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height));
}

/** First image of a TIFF as RGBA. Throws on anything UTIF cannot read. */
export function decodeTiff(bytes: ArrayBuffer): Rgba {
  const ifds = UTIF.decode(bytes);
  const page = ifds.find((d) => (d as unknown as { t256?: number[] }).t256) ?? ifds[0];
  if (!page) throw new Error('no image');
  UTIF.decodeImage(bytes, page);
  const rgba = UTIF.toRGBA8(page);
  if (!(page.width > 0 && page.height > 0) || rgba.length !== page.width * page.height * 4) throw new Error('bad image');
  return { data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: page.width, height: page.height };
}

export function sniffExtra(head: Uint8Array): ExtraMime | null {
  const a = (i: number) => head[i] ?? -1;
  if (a(0) === 0x47 && a(1) === 0x49 && a(2) === 0x46) return 'image/gif';
  if (a(0) === 0x42 && a(1) === 0x4d) return 'image/bmp';
  if (a(0) === 0 && a(1) === 0 && a(2) === 1 && a(3) === 0) return 'image/x-icon';
  if ((a(0) === 0x49 && a(1) === 0x49 && a(2) === 42 && a(3) === 0) || (a(0) === 0x4d && a(1) === 0x4d && a(2) === 0 && a(3) === 42)) return 'image/tiff';
  if (String.fromCharCode(a(4), a(5), a(6), a(7)) === 'ftyp' && /avi[fs]/.test(String.fromCharCode(...head.subarray(8, 32)))) return 'image/avif';
  return null;
}
