import { describe, expect, it } from 'vitest';
import { identifyHash } from './hash-id';

const names = (s: string) => {
  const r = identifyHash(s);
  if (!r.ok) throw new Error(r.error);
  return r.candidates.map((c) => c.name);
};

describe('hash identifier', () => {
  it('guesses hex digests by length', () => {
    expect(names('d41d8cd98f00b204e9800998ecf8427e')).toEqual(['MD5', 'NTLM', 'MD4']);
    expect(names('a'.repeat(64))).toEqual(['SHA-256', 'SHA3-256', 'BLAKE2s-256']);
  });

  it('recognises bcrypt, Argon2, and SHA-512 crypt prefixes', () => {
    expect(names('$2b$12$' + 'a'.repeat(53))).toEqual(['bcrypt']);
    expect(names('$argon2id$v=19$m=65536')).toEqual(['Argon2']);
    expect(names('$6$saltsalt$hash')).toEqual(['SHA-512 crypt']);
  });

  it('guesses Base64 digests from the decoded byte length', () => {
    const sha256Base64 = btoa('x'.repeat(32));
    expect(names(sha256Base64)).toContain('SHA-256 (Base64)');
  });

  it('returns no candidates for plain words and errors on empty input', () => {
    expect(names('hello')).toEqual([]);
    expect(identifyHash('  ')).toEqual({ ok: false, error: 'Paste a hash or hash-like string to identify.' });
  });
});
