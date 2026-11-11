import exifr from 'exifr';
import { isRemovableKind, KIND_LABEL, listSegments, type Segment } from './segments';
import { readIfd0, TAG_ORIENTATION, tiffOf } from './tiff';

export type Verdict = {
  clean: boolean;
  /** Human-readable items still present. Empty when clean. */
  remaining: string[];
  /** True when the only EXIF left is the Orientation tag that was kept on purpose. */
  keptOrientation: boolean;
};

const GPS_KEY = /^(GPS|latitude$|longitude$|altitude$)/;
/** Image-header fields exifr reports for every picture. They describe pixels, not who took the photo. */
const STRUCTURE = new Set(['Orientation', 'ImageWidth', 'ImageHeight', 'BitDepth', 'BitsPerSample', 'ColorType', 'Compression', 'Filter', 'Interlace', 'YCbCrSubSampling', 'ResolutionUnit', 'XResolution', 'YResolution']);
const EXIFR_OPTIONS = { tiff: true, exif: true, gps: true, iptc: true, xmp: true, icc: false, jfif: false } as const;

function exifSegmentLabel(bytes: Uint8Array, seg: Segment): 'orientation' | 'EXIF' {
  const ifd = readIfd0(tiffOf(bytes.subarray(seg.payload, seg.payloadEnd)));
  return ifd && ifd.tags.length === 1 && ifd.tags[0] === TAG_ORIENTATION ? 'orientation' : 'EXIF';
}

/**
 * Checks an output file with two independent paths: the container walker and exifr.
 * clean is true only when no EXIF (other than a kept orientation), GPS, XMP, IPTC, comment or text chunk is found.
 */
export async function verifyClean(bytes: Uint8Array): Promise<Verdict> {
  let segments: Segment[];
  try {
    segments = listSegments(bytes).segments;
  } catch {
    return { clean: false, remaining: ['The output could not be re-read by the container check'], keptOrientation: false };
  }

  const remaining = new Set<string>();
  let keptOrientation = false;
  for (const seg of segments) {
    if (seg.kind === 'exif') {
      if (exifSegmentLabel(bytes, seg) === 'orientation') keptOrientation = true;
      else remaining.add(KIND_LABEL.exif);
    } else if (isRemovableKind(seg.kind)) {
      remaining.add(KIND_LABEL[seg.kind]);
    }
  }

  let fields: Record<string, unknown> = {};
  try {
    fields = ((await exifr.parse(bytes, EXIFR_OPTIONS)) as Record<string, unknown> | undefined) ?? {};
  } catch {
    fields = {};
  }
  const keys = Object.keys(fields).filter((k) => !STRUCTURE.has(k));
  if (keys.some((k) => GPS_KEY.test(k))) remaining.add('GPS location');
  const other = keys.filter((k) => !GPS_KEY.test(k));
  if (other.length) remaining.add(`EXIF/XMP/IPTC field (${other.slice(0, 3).join(', ')})`);

  return { clean: remaining.size === 0, remaining: [...remaining], keptOrientation };
}
