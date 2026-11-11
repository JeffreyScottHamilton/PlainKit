import { MIME_TYPES, type MimeEntry } from '../data/mime-types';

/** Matches extension (with or without a leading dot) or MIME text. Empty query lists everything. */
export function searchMime(query: string): MimeEntry[] {
  const q = query.trim().toLowerCase().replace(/^\./, '');
  if (!q) return [...MIME_TYPES];
  return MIME_TYPES.filter((e) => e.ext.includes(q) || e.mime.includes(q));
}

export function mimeForExt(ext: string): string | undefined {
  const e = ext.trim().toLowerCase().replace(/^\./, '');
  return MIME_TYPES.find((m) => m.ext === e)?.mime;
}

export function extsForMime(mime: string): string[] {
  const m = mime.trim().toLowerCase().split(';')[0]!.trim();
  return MIME_TYPES.filter((e) => e.mime === m).map((e) => e.ext);
}
