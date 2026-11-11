// MD5 is not in Web Crypto, so it is deliberately not offered.
export const HASH_ALGS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
export type HashAlg = (typeof HASH_ALGS)[number];

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function digestUtf8(text: string, alg: HashAlg): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable in this context. It needs HTTPS or localhost.');
  const buf = await crypto.subtle.digest(alg, new TextEncoder().encode(text));
  return new Uint8Array(buf);
}
