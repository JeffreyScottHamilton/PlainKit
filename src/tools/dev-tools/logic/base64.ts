export type Base64Outcome = { ok: true; text: string } | { ok: false; message: string };

export function bytesToBase64(bytes: Uint8Array, urlSafe: boolean): string {
  let bin = '';
  // chunked so large inputs do not overflow the argument limit of String.fromCharCode
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const std = btoa(bin);
  return urlSafe ? std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : std;
}

/** Accepts standard and URL-safe alphabets, optional padding, and whitespace (line-wrapped input). */
export function base64ToBytes(input: string): Uint8Array | null {
  const compact = input.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/\-_]*={0,2}$/.test(compact)) return null;
  const body = compact.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (body.length % 4 === 1) return null;
  const padded = body + '='.repeat((4 - (body.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeBase64Utf8(text: string, urlSafe: boolean): string {
  return bytesToBase64(new TextEncoder().encode(text), urlSafe);
}

export function decodeBase64Utf8(input: string): Base64Outcome {
  if (input.trim() === '') return { ok: false, message: 'Paste Base64 text to decode.' };
  const bytes = base64ToBytes(input);
  if (!bytes) return { ok: false, message: 'Not valid Base64. Use only A-Z, a-z, 0-9, + / (or - _ for URL-safe), with optional = padding.' };
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, message: 'Decodes to bytes that are not UTF-8 text. The data may be binary; this tool shows text only.' };
  }
}
