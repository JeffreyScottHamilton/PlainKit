// RC4 stream cipher. Needed only to read legacy PDFs (V1/V2/V4 with RC4); this tool never writes RC4.

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length === 0) throw new RangeError('RC4 key must not be empty');
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 255;
    const t = s[i]!;
    s[i] = s[j]!;
    s[j] = t;
  }
  const out = new Uint8Array(data.length);
  let a = 0;
  let b = 0;
  for (let n = 0; n < data.length; n++) {
    a = (a + 1) & 255;
    b = (b + s[a]!) & 255;
    const t = s[a]!;
    s[a] = s[b]!;
    s[b] = t;
    out[n] = data[n]! ^ s[(s[a]! + s[b]!) & 255]!;
  }
  return out;
}
