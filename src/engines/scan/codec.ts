import { ToolError } from '@/lib/errors';
import { decodeHeic } from '@/engines/image/heic';
import { sniffImageMime, SNIFF_BYTES } from '@/engines/image/sniff';
import type { PageFormat, Raster } from './types';

const MAX_PIXELS = 60_000_000;
export const JPEG_QUALITY = 0.85;

/** Decodes with EXIF orientation applied. HEIC goes through libheif when the browser cannot read it. Worker only. */
export async function decodeRaster(blob: Blob): Promise<Raster> {
  const mime = sniffImageMime(new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer()));
  if (!mime) throw new ToolError('unsupported-input', 'This file is not a photo the browser can read.', 'Choose a JPEG, PNG, WebP or HEIC photo.');
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    if (mime !== 'image/heic') throw new ToolError('decode-failed', 'This photo could not be decoded. It may be damaged.', 'Try another photo.');
  }
  if (!bitmap) {
    const heic = await decodeHeic(blob);
    if (heic.data.width * heic.data.height > MAX_PIXELS) throw new ToolError('too-large', 'This photo is too large to scan in the browser.', 'Use a smaller photo.');
    return { width: heic.data.width, height: heic.data.height, data: heic.data.data };
  }
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS || bitmap.width < 1 || bitmap.height < 1) {
      throw new ToolError('too-large', 'This photo is too large to scan in the browser.', 'Use a smaller photo.');
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ToolError('unsupported', 'This browser cannot read image pixels.', 'Try another browser.');
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: img.width, height: img.height, data: img.data };
  } finally {
    bitmap.close();
  }
}

/** Encodes and checks the bytes: browsers silently fall back to PNG for unsupported encoders. */
export async function encodeRaster(r: Raster, format: PageFormat): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(r.width, r.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ToolError('unsupported', 'This browser cannot draw images.', 'Try another browser.');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  const blob = await canvas.convertToBlob(format === 'image/jpeg' ? { type: format, quality: JPEG_QUALITY } : { type: format });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type !== format || !hasMagic(bytes, format)) throw new ToolError('encode-failed', `This browser could not write a ${format === 'image/jpeg' ? 'JPEG' : 'PNG'} image.`, 'Try PNG or PDF instead.');
  return bytes;
}

function hasMagic(b: Uint8Array, format: PageFormat): boolean {
  if (format === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}
