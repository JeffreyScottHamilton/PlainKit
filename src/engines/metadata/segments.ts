import { ToolError } from '../../lib/errors';
import { sniffImageMime } from '../image/sniff';
import { ascii, startsWith, u16be, u32be, u32le } from './bytes';

// Container-level walk: lists metadata segments by byte range. Never decodes pixels.
export type MetaFormat = 'jpeg' | 'png' | 'webp';
export type SegmentKind = 'exif' | 'xmp' | 'iptc' | 'icc' | 'comment' | 'text' | 'time' | 'other' | 'keep';

export type Segment = {
  kind: SegmentKind;
  label: string;
  /** Offset of the whole segment (JPEG marker, PNG/WebP chunk header included). */
  start: number;
  /** Exclusive end, including CRC and padding byte. */
  end: number;
  payload: number;
  payloadEnd: number;
};

export type Parsed = {
  format: MetaFormat;
  segments: Segment[];
  /** Bytes after the segments that are copied verbatim (JPEG: from the scan data). Empty for PNG/WebP. */
  tail: Uint8Array;
};

export const KIND_LABEL: Record<SegmentKind, string> = {
  exif: 'EXIF',
  xmp: 'XMP',
  iptc: 'IPTC',
  icc: 'Color profile',
  comment: 'Comment',
  text: 'Text note',
  time: 'Modification time',
  other: 'Other app data',
  keep: 'Image structure',
};

/** Kinds that are always removed. Color profiles are removed only when the caller opts out of keepIcc. */
export const isRemovableKind = (k: SegmentKind): boolean => k !== 'keep' && k !== 'icc';

function corrupt(detail: string): ToolError {
  return new ToolError('corrupt-input', `The file structure is damaged (${detail}), so its metadata cannot be read safely.`, 'Try another copy of the file.');
}

function classifyJpeg(m: number, p: Uint8Array): SegmentKind {
  if (m === 0xe1) {
    if (startsWith(p, 0, 'Exif\0\0')) return 'exif';
    if (startsWith(p, 0, 'http://ns.adobe.com/xap/1.0/\0') || startsWith(p, 0, 'http://ns.adobe.com/xmp/extension/\0')) return 'xmp';
    return 'other';
  }
  if (m === 0xe2) return startsWith(p, 0, 'ICC_PROFILE\0') ? 'icc' : 'other';
  if (m === 0xed) return startsWith(p, 0, 'Photoshop 3.0\0') ? 'iptc' : 'other';
  if (m === 0xfe) return 'comment';
  // APP0 (JFIF) and APP14 (Adobe colour transform) are needed to decode the picture, so they are kept.
  if (m >= 0xe3 && m <= 0xef && m !== 0xee) return 'other';
  return 'keep';
}

function parseJpeg(b: Uint8Array): Parsed {
  const segments: Segment[] = [];
  let p = 2;
  for (;;) {
    if (p + 2 > b.length) throw corrupt('JPEG ends before the image data');
    if (b[p] !== 0xff) throw corrupt('expected a JPEG marker');
    const m = b[p + 1]!;
    if (m === 0xff) {
      p += 1;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      p += 2;
      continue;
    }
    // Start of scan or end of image: everything from here is copied verbatim.
    if (m === 0xda || m === 0xd9) return { format: 'jpeg', segments, tail: b.subarray(p) };
    if (p + 4 > b.length) throw corrupt('JPEG segment header is cut off');
    const len = u16be(b, p + 2);
    if (len < 2 || p + 2 + len > b.length) throw corrupt('JPEG segment runs past the end of the file');
    const end = p + 2 + len;
    const kind = classifyJpeg(m, b.subarray(p + 4, end));
    segments.push({ kind, label: KIND_LABEL[kind], start: p, end, payload: p + 4, payloadEnd: end });
    p = end;
  }
}

function classifyPng(type: string, data: Uint8Array): SegmentKind {
  switch (type) {
    case 'eXIf':
      return 'exif';
    case 'tEXt':
    case 'zTXt':
      return 'text';
    case 'iTXt': {
      const nul = data.indexOf(0);
      return nul > 0 && ascii(data, 0, nul) === 'XML:com.adobe.xmp' ? 'xmp' : 'text';
    }
    case 'tIME':
      return 'time';
    case 'iCCP':
      return 'icc';
    default:
      return 'keep';
  }
}

function parsePng(b: Uint8Array): Parsed {
  const segments: Segment[] = [];
  let p = 8;
  for (;;) {
    if (p + 12 > b.length) throw corrupt('PNG chunk header is cut off');
    const len = u32be(b, p);
    const type = ascii(b, p + 4, 4);
    const payload = p + 8;
    const end = payload + len + 4;
    if (end > b.length) throw corrupt('PNG chunk runs past the end of the file');
    const kind = classifyPng(type, b.subarray(payload, payload + len));
    segments.push({ kind, label: KIND_LABEL[kind], start: p, end, payload, payloadEnd: payload + len });
    if (type === 'IEND') return { format: 'png', segments, tail: new Uint8Array(0) };
    p = end;
  }
}

function classifyWebp(type: string): SegmentKind {
  if (type === 'EXIF') return 'exif';
  if (type === 'XMP ') return 'xmp';
  if (type === 'ICCP') return 'icc';
  return 'keep';
}

function parseWebp(b: Uint8Array): Parsed {
  if (b.length < 12) throw corrupt('WebP header is cut off');
  const riffEnd = 8 + u32le(b, 4);
  if (riffEnd > b.length) throw corrupt('WebP is shorter than its RIFF header says');
  const segments: Segment[] = [];
  let p = 12;
  while (p < riffEnd) {
    if (p + 8 > riffEnd) throw corrupt('WebP chunk header is cut off');
    const type = ascii(b, p, 4);
    const size = u32le(b, p + 4);
    const payload = p + 8;
    if (payload + size > riffEnd) throw corrupt('WebP chunk runs past the end of the file');
    const kind = classifyWebp(type);
    const end = Math.min(payload + size + (size & 1), riffEnd);
    segments.push({ kind, label: KIND_LABEL[kind], start: p, end, payload, payloadEnd: payload + size });
    p = end;
  }
  return { format: 'webp', segments, tail: new Uint8Array(0) };
}

/** Lists metadata segments of a JPEG, PNG or WebP. Throws ToolError for other formats or damaged structure. */
export function listSegments(bytes: Uint8Array): Parsed {
  const mime = sniffImageMime(bytes);
  if (mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);
  if (mime === 'image/png') return parsePng(bytes);
  if (mime === 'image/webp') return parseWebp(bytes);
  throw new ToolError('unsupported-format', 'Removing metadata from this format is not supported yet.', 'Use a JPEG, PNG or WebP file.');
}
