import exifr from 'exifr';
import { sniffImageMime, type ImageMime } from '../image/sniff';
import { KIND_LABEL, isRemovableKind, listSegments } from './segments';

export type MetaField = { name: string; value: string };
export type MetaGroup = { title: string; fields: MetaField[] };
export type MetadataReport = {
  /** Sniffed from content, null when the file is not a recognised image. */
  format: ImageMime | null;
  /** Whether this tool can remove metadata from the format. */
  cleanable: boolean;
  hasLocation: boolean;
  /** Labels of removable metadata found by the container walker. */
  present: string[];
  /** Set when the container walker could not read a cleanable file. Nothing is removed in that case. */
  structureError?: string;
  groups: MetaGroup[];
};

const TITLES = ['Location', 'Camera', 'Date and time', 'Software', 'Author and copyright', 'Other'] as const;
const GROUP_OF: Record<string, (typeof TITLES)[number]> = {
  Make: 'Camera', Model: 'Camera', LensModel: 'Camera', LensMake: 'Camera', ISO: 'Camera', FNumber: 'Camera', ExposureTime: 'Camera', FocalLength: 'Camera', Flash: 'Camera',
  DateTimeOriginal: 'Date and time', CreateDate: 'Date and time', ModifyDate: 'Date and time', DateTime: 'Date and time', OffsetTime: 'Date and time', OffsetTimeOriginal: 'Date and time',
  Software: 'Software', CreatorTool: 'Software', ProcessingSoftware: 'Software', HostComputer: 'Software',
  Artist: 'Author and copyright', Copyright: 'Author and copyright', Byline: 'Author and copyright', CopyrightNotice: 'Author and copyright', creator: 'Author and copyright', rights: 'Author and copyright',
  latitude: 'Location', longitude: 'Location', altitude: 'Location',
};

const MAX_VALUE = 200;

/** Text only: values are shown as plain strings, never as markup. Binary blobs are skipped. */
function formatValue(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    const s = String(v);
    return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE)}…` : s;
  }
  if (Array.isArray(v)) {
    const parts = v.map(formatValue).filter((x): x is string => x !== undefined);
    return parts.length ? parts.join(', ') : undefined;
  }
  return undefined;
}

/** Reads metadata fields for display. Read-only: never modifies the file. */
export async function readMetadata(blob: Blob): Promise<MetadataReport> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const format = sniffImageMime(bytes);
  if (!format) return { format: null, cleanable: false, hasLocation: false, present: [], groups: [] };
  const cleanable = format === 'image/jpeg' || format === 'image/png' || format === 'image/webp';

  let present: string[] = [];
  let structureError: string | undefined;
  if (cleanable) {
    try {
      present = [...new Set(listSegments(bytes).segments.filter((s) => isRemovableKind(s.kind)).map((s) => KIND_LABEL[s.kind]))];
    } catch (e) {
      structureError = e instanceof Error ? e.message : 'The file structure could not be read.';
    }
  }

  let fields: Record<string, unknown> = {};
  try {
    fields = ((await exifr.parse(bytes, { tiff: true, exif: true, gps: true, iptc: true, xmp: true, icc: false })) as Record<string, unknown> | undefined) ?? {};
  } catch {
    fields = {};
  }

  const grouped = new Map<string, MetaField[]>(TITLES.map((t) => [t, []]));
  for (const [name, raw] of Object.entries(fields)) {
    const value = formatValue(raw);
    if (value === undefined) continue;
    const title = /^GPS/.test(name) ? 'Location' : (GROUP_OF[name] ?? 'Other');
    grouped.get(title)!.push({ name, value });
  }
  const lat = fields['latitude'];
  const lon = fields['longitude'];
  const hasLocation = typeof lat === 'number' && typeof lon === 'number';
  if (hasLocation) {
    const loc = grouped.get('Location')!;
    loc.unshift({ name: 'GPS position', value: `${lat.toFixed(5)}, ${lon.toFixed(5)}` });
  }
  const groups = TITLES.map((title) => ({ title, fields: grouped.get(title)! })).filter((g) => g.fields.length > 0);
  return { format, cleanable, hasLocation: hasLocation || groups.some((g) => g.title === 'Location'), present, structureError, groups };
}
