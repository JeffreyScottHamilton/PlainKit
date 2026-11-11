import { concat, crc32, le32, be32, ascii } from './bytes';
import { listSegments, isRemovableKind, type Parsed, type Segment } from './segments';
import { orientationTiff, readIfd0, tiffOf } from './tiff';

export type StripOptions = {
  /** Keep the ICC color profile (default true in the UI). */
  keepIcc: boolean;
  /** Keep the EXIF Orientation tag as a minimal EXIF block so the picture is not turned sideways. */
  keepOrientation: boolean;
};

const CHUNK_FLAGS = { exif: 0x08, xmp: 0x04, icc: 0x20 } as const;

function kept(seg: Segment, opts: StripOptions): boolean {
  if (seg.kind === 'icc') return opts.keepIcc;
  return !isRemovableKind(seg.kind);
}

/** The Orientation-only replacement for an EXIF segment, or null when nothing needs keeping. */
function orientationReplacement(parsed: Parsed, bytes: Uint8Array, seg: Segment): Uint8Array | null {
  const orientation = readIfd0(tiffOf(bytes.subarray(seg.payload, seg.payloadEnd)))?.orientation;
  if (orientation === undefined || orientation === 1) return null;
  const tiff = orientationTiff(orientation);
  if (parsed.format === 'jpeg') {
    const len = 2 + 6 + tiff.length;
    return concat([Uint8Array.of(0xff, 0xe1, len >>> 8, len & 0xff), new TextEncoder().encode('Exif\0\0'), tiff]);
  }
  if (parsed.format === 'png') return pngChunk('eXIf', tiff);
  return webpChunk('EXIF', tiff);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat([new TextEncoder().encode(type), data]);
  return concat([be32(data.length), typed, be32(crc32(typed))]);
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const pad = data.length & 1 ? Uint8Array.of(0) : new Uint8Array(0);
  return concat([new TextEncoder().encode(type), le32(data.length), data, pad]);
}

/**
 * Removes metadata segments without re-encoding: kept segments and the image data are copied byte for byte.
 * Throws ToolError for unsupported formats or damaged structure.
 */
export function stripMetadata(bytes: Uint8Array, opts: StripOptions): Uint8Array {
  const parsed = listSegments(bytes);
  if (parsed.format === 'webp') return stripWebp(bytes, parsed, opts);
  const prefix = bytes.subarray(0, parsed.format === 'jpeg' ? 2 : 8);
  const pieces: Uint8Array[] = [prefix];
  for (const seg of parsed.segments) {
    if (seg.kind === 'exif' && opts.keepOrientation) {
      const rep = orientationReplacement(parsed, bytes, seg);
      if (rep) pieces.push(rep);
    } else if (kept(seg, opts)) {
      pieces.push(bytes.subarray(seg.start, seg.end));
    }
  }
  pieces.push(parsed.tail);
  return concat(pieces);
}

function stripWebp(bytes: Uint8Array, parsed: Parsed, opts: StripOptions): Uint8Array {
  const pieces: Uint8Array[] = [];
  let vp8xAt = -1;
  const present = { exif: false, xmp: false, icc: false };
  for (const seg of parsed.segments) {
    if (seg.kind === 'exif' && opts.keepOrientation) {
      const rep = orientationReplacement(parsed, bytes, seg);
      if (rep) {
        pieces.push(rep);
        present.exif = true;
      }
    } else if (kept(seg, opts)) {
      if (seg.kind === 'exif' || seg.kind === 'xmp' || seg.kind === 'icc') present[seg.kind] = true;
      if (ascii(bytes, seg.start, 4) === 'VP8X') vp8xAt = pieces.length;
      pieces.push(bytes.slice(seg.start, seg.end));
    }
  }
  // VP8X flags announce which metadata chunks exist. Clear the ones removed, set the ones kept.
  if (vp8xAt >= 0) {
    const vp8x = pieces[vp8xAt]!;
    const mask = CHUNK_FLAGS.exif | CHUNK_FLAGS.xmp | CHUNK_FLAGS.icc;
    const want = (present.exif ? CHUNK_FLAGS.exif : 0) | (present.xmp ? CHUNK_FLAGS.xmp : 0) | (present.icc ? CHUNK_FLAGS.icc : 0);
    vp8x[8] = (vp8x[8]! & ~mask) | want;
  }
  const body = concat(pieces);
  return concat([new TextEncoder().encode('RIFF'), le32(body.length + 4), new TextEncoder().encode('WEBP'), body]);
}
