export type HashCandidate = { name: string; detail: string };
export type HashIdResult = { ok: true; candidates: HashCandidate[] } | { ok: false; error: string };

const HEX_LEN: Record<number, string[]> = {
  8: ['CRC32 (8 hex digits)'],
  32: ['MD5', 'NTLM', 'MD4'],
  40: ['SHA-1', 'RIPEMD-160'],
  56: ['SHA-224', 'SHA3-224'],
  64: ['SHA-256', 'SHA3-256', 'BLAKE2s-256'],
  96: ['SHA-384', 'SHA3-384'],
  128: ['SHA-512', 'SHA3-512', 'BLAKE2b-512', 'Whirlpool'],
};

// Base64 decoded byte length to digest names. Padded standard Base64 only.
const B64_BYTES: Record<number, string[]> = {
  16: ['MD5'],
  20: ['SHA-1', 'RIPEMD-160'],
  28: ['SHA-224'],
  32: ['SHA-256', 'SHA3-256', 'BLAKE2s-256'],
  48: ['SHA-384'],
  64: ['SHA-512', 'BLAKE2b-512'],
};

export function identifyHash(raw: string): HashIdResult {
  const v = raw.trim();
  if (!v) return { ok: false, error: 'Paste a hash or hash-like string to identify.' };
  const out: HashCandidate[] = [];
  const add = (name: string, detail: string) => out.push({ name, detail });

  if (/^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(v)) add('bcrypt', `60 characters, cost factor ${v.slice(4, 6)}`);
  if (/^\$argon2(i|d|id)\$/.test(v)) add('Argon2', 'PHC string, starts with $argon2i$, $argon2d$, or $argon2id$');
  if (/^\$6\$/.test(v)) add('SHA-512 crypt', 'Unix crypt, starts with $6$');
  if (/^\$5\$/.test(v)) add('SHA-256 crypt', 'Unix crypt, starts with $5$');
  if (/^\$1\$/.test(v)) add('MD5 crypt', 'Unix crypt, starts with $1$');

  if (/^[0-9a-fA-F]+$/.test(v)) {
    for (const name of HEX_LEN[v.length] ?? []) add(name, `${v.length} hex characters (${v.length * 4} bits)`);
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0) {
    const pad = v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0;
    const bytes = (v.length * 3) / 4 - pad;
    for (const name of B64_BYTES[bytes] ?? []) add(`${name} (Base64)`, `Base64 of ${bytes} bytes`);
  }
  return { ok: true, candidates: out };
}
