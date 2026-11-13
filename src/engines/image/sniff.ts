/** Image formats recognised by content (magic bytes), never by file name. */
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/bmp' | 'image/avif' | 'image/heic';

/** BMP DIB header sizes that exist in practice (OS/2 12, then Windows 16/40/52/56/64/108/124). */
const BMP_DIB_SIZES = new Set([12, 16, 40, 52, 56, 64, 108, 124]);

/** Bytes needed by sniffImageMime. */
export const SNIFF_BYTES = 64;

function ascii(b: Uint8Array, at: number, text: string): boolean {
  if (at < 0 || at + text.length > b.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

function u32le(b: Uint8Array, at: number): number {
  if (at + 4 > b.length) return -1;
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
}

function u32be(b: Uint8Array, at: number): number {
  if (at + 4 > b.length) return -1;
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
}

/** Detects the real format from the first bytes. Returns null for anything not recognised. Pure. */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((v, i) => bytes[i] === v)) return 'image/png';
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return 'image/webp';
  if (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a')) return 'image/gif';
  if (ascii(bytes, 4, 'ftyp') && (ascii(bytes, 8, 'avif') || ascii(bytes, 8, 'avis'))) return 'image/avif';
  if (ascii(bytes, 4, 'ftyp')) {
    // HEIF family. The major brand can be generic (mif1/msf1), so the compatible brands decide between AVIF and HEIC.
    const size = Math.min(u32be(bytes, 0), bytes.length);
    const brands: string[] = [];
    for (let o = 8; o + 4 <= size; o += o === 8 ? 8 : 4) brands.push(String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!));
    if (brands.some((b) => b === 'avif' || b === 'avis')) return 'image/avif';
    if (brands.some((b) => ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'].includes(b))) return 'image/heic';
  }
  if (
    ascii(bytes, 0, 'BM') &&
    bytes.length >= 18 &&
    u32le(bytes, 10) >= 14 &&
    BMP_DIB_SIZES.has(u32le(bytes, 14))
  )
    return 'image/bmp';
  return null;
}

/**
 * Reads the first bytes of a blob and sniffs them. Never reads the whole file.
 * Resolves null when the content is not a supported image.
 */
export async function sniffBlob(blob: Blob): Promise<ImageMime | null> {
  return sniffImageMime(new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer()));
}

/**
 * Whether the file is animated, using only its header/chunk structure.
 * WebP: VP8X animation flag. PNG: an acTL chunk before IDAT (APNG).
 * GIF is not inspected here; callers treat GIF as "first frame only".
 * `head` should hold the first part of the file (256 KB is plenty).
 */
export function isAnimated(head: Uint8Array, mime: ImageMime): boolean {
  if (mime === 'image/webp') {
    return ascii(head, 12, 'VP8X') && head.length > 20 && ((head[20] ?? 0) & 0x02) !== 0;
  }
  if (mime === 'image/png') {
    let pos = 8;
    while (pos + 8 <= head.length) {
      const len = u32be(head, pos);
      if (len < 0) return false;
      if (ascii(head, pos + 4, 'acTL')) return true;
      if (ascii(head, pos + 4, 'IDAT') || ascii(head, pos + 4, 'IEND')) return false;
      pos += 12 + len;
    }
  }
  return false;
}
