import { u16be, u32be, u32le, le32, concat, startsWith } from './bytes';

/** Orientation tag id and the EXIF payload prefix that precedes a TIFF block in JPEG/WebP. */
export const TAG_ORIENTATION = 0x0112;
const EXIF_PREFIX = 'Exif\0\0';

/** TIFF block inside an Exif payload (JPEG APP1, PNG eXIf, WebP EXIF), with or without the "Exif\0\0" prefix. */
export function tiffOf(payload: Uint8Array): Uint8Array {
  return startsWith(payload, 0, EXIF_PREFIX) ? payload.subarray(6) : payload;
}

/** IFD0 tag ids and the Orientation value. null when the TIFF block is malformed. */
export function readIfd0(t: Uint8Array): { tags: number[]; orientation?: number } | null {
  if (t.length < 8) return null;
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return null;
  const u16 = (o: number) => (le ? t[o]! | (t[o + 1]! << 8) : u16be(t, o));
  const u32 = (o: number) => (le ? u32le(t, o) : u32be(t, o));
  const ifd = u32(4);
  if (ifd + 2 > t.length) return null;
  const count = u16(ifd);
  if (ifd + 2 + count * 12 > t.length) return null;
  const tags: number[] = [];
  let orientation: number | undefined;
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e);
    tags.push(tag);
    if (tag === TAG_ORIENTATION && u16(e + 2) === 3 && u32(e + 4) >= 1) {
      const v = u16(e + 8);
      if (v >= 1 && v <= 8) orientation = v;
    }
  }
  return { tags, orientation };
}

/** Minimal little-endian TIFF holding only the Orientation tag. */
export function orientationTiff(orientation: number): Uint8Array {
  return concat([
    Uint8Array.of(0x49, 0x49, 0x2a, 0x00), le32(8),
    Uint8Array.of(1, 0), // one entry
    Uint8Array.of(0x12, 0x01, 0x03, 0x00, 1, 0, 0, 0, orientation, 0, 0, 0), // Orientation, SHORT, count 1
    le32(0), // no next IFD
  ]);
}
