export const RASTER_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'] as const;
export const WARN_BYTES = 1024 * 1024;

const DATA_URI = /^data:(image\/(?:png|jpeg|webp|gif|avif|bmp));base64,([A-Za-z0-9+/]*={0,2})$/;

export type DataUri = { ok: true; mime: string; base64: string; bytes: number } | { ok: false; error: string };

/** Accepts only raster image data URIs. SVG and other types are rejected so no script-bearing content is previewed. */
export function parseDataUri(input: string): DataUri {
  const s = input.replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Paste a data:image/...;base64,... URI.' };
  if (!s.startsWith('data:')) return { ok: false, error: 'Not a data URI. It must start with data:image/.' };
  const m = DATA_URI.exec(s);
  if (!m) {
    if (/^data:image\/svg/i.test(s)) return { ok: false, error: 'SVG is not allowed here because it can contain scripts. Use PNG, JPEG, WebP, GIF, AVIF, or BMP.' };
    return { ok: false, error: 'Only base64 data URIs for PNG, JPEG, WebP, GIF, AVIF, or BMP are supported.' };
  }
  const base64 = m[2]!;
  if (base64.length % 4 !== 0) return { ok: false, error: 'Base64 length is wrong. Check for a truncated or extra character.' };
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  return { ok: true, mime: m[1]!, base64, bytes };
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function toDataUri(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}
