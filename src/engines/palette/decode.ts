import { ToolError } from '@/lib/errors';
import { decodeTiff } from '@/engines/image/extra';
import { decodeHeic } from '@/engines/image/heic';
import { assertDecodable, fitWithin } from '@/engines/image/dimensions';
import { sniffImageMime, type ImageMime } from '@/engines/image/sniff';
import type { Rgba } from './types';

const HEAD_BYTES = 1024;

async function toBitmap(blob: Blob, mime: ImageMime): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    const failed = () => new ToolError('decode-failed', `This ${mime.slice(6).toUpperCase()} could not be decoded. It may be damaged, or this browser cannot read it.`, 'Try another file.');
    // Same fallbacks as the image pipeline: HEIC via libheif, TIFF via UTIF.
    if (mime === 'image/heic') return createImageBitmap((await decodeHeic(blob)).data);
    if (mime === 'image/tiff') {
      try {
        const t = decodeTiff(await blob.arrayBuffer());
        return await createImageBitmap(new ImageData(new Uint8ClampedArray(t.data), t.width, t.height));
      } catch {
        throw failed();
      }
    }
    throw failed();
  }
}

/** Decodes the first frame with EXIF orientation applied, then downscales so the longest side is at most maxSide. */
export async function decodeToRgba(blob: Blob, maxSide: number): Promise<Rgba> {
  const mime = sniffImageMime(new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer()));
  if (!mime || mime === 'image/svg+xml') {
    throw new ToolError('unsupported-input', 'This file is not a JPEG, PNG, WebP, GIF, BMP, AVIF, HEIC or TIFF image.', 'Choose an image in one of those formats.');
  }
  const bitmap = await toBitmap(blob, mime);
  try {
    assertDecodable(bitmap.width, bitmap.height);
  } catch (e) {
    bitmap.close();
    throw e;
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new ToolError('unsupported', 'This browser cannot read pixels from an image.', 'Try another browser.');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { width, height, data: g.getImageData(0, 0, width, height).data };
}
