// AES and SHA through WebCrypto. WebCrypto cannot disable AES-CBC padding, so the no-padding
// helpers below add and strip a block with the padding API instead. Tests check them against node:crypto.

const subtle = globalThis.crypto.subtle;
const ZERO = new Uint8Array(16);

export const randomBytes = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const key = (raw: Uint8Array, usage: KeyUsage[]) => subtle.importKey('raw', new Uint8Array(raw), 'AES-CBC', false, usage);

/** AES-CBC with PKCS#5 padding (the PDF default for strings and streams). */
export async function aesCbcEncrypt(raw: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const out = await subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(iv) }, await key(raw, ['encrypt']), new Uint8Array(data));
  return new Uint8Array(out);
}

/** Throws a plain Error when the padding is wrong. Callers map that to a ToolError. */
export async function aesCbcDecrypt(raw: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const out = await subtle.decrypt({ name: 'AES-CBC', iv: new Uint8Array(iv) }, await key(raw, ['decrypt']), new Uint8Array(data));
  return new Uint8Array(out);
}

/** CBC encryption of whole blocks, no padding. WebCrypto appends one padding block; drop it. */
export async function aesCbcEncryptNoPad(raw: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (data.length % 16 !== 0) throw new RangeError('no-padding AES input must be whole blocks');
  if (data.length === 0) return data;
  return (await aesCbcEncrypt(raw, iv, data)).subarray(0, data.length);
}

/**
 * CBC decryption of whole blocks, no padding. Trick: append a block Y that decrypts to a valid
 * padding block (0x10 x16). Y = E(C_last xor 0x10..), which WebCrypto gives as the first block of
 * a CBC encryption with a zero IV. The appended block then strips off cleanly.
 */
export async function aesCbcDecryptNoPad(raw: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (data.length % 16 !== 0) throw new RangeError('no-padding AES input must be whole blocks');
  if (data.length === 0) return data;
  const last = data.subarray(data.length - 16);
  const x = last.map((b) => b ^ 0x10);
  const y = (await aesCbcEncrypt(raw, ZERO, x)).subarray(0, 16);
  return aesCbcDecrypt(raw, iv, concat(data, y));
}

export async function sha(bits: 256 | 384 | 512, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest(`SHA-${bits}`, new Uint8Array(data)));
}
