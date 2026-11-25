// @vitest-environment node
import { createHash, randomBytes as nodeRandom } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { md5 } from './md5';
import { rc4 } from './rc4';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const enc = (s: string) => new TextEncoder().encode(s);

describe('md5 (RFC 1321 test suite)', () => {
  const vectors: [string, string][] = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
  ];
  it.each(vectors)('hashes %j', (input, expected) => {
    expect(hex(md5(enc(input)))).toBe(expected);
  });

  it('matches node:crypto across padding boundaries (0..200 bytes, random)', () => {
    for (let n = 0; n <= 200; n++) {
      const data = new Uint8Array(nodeRandom(n));
      expect(hex(md5(data))).toBe(createHash('md5').update(data).digest('hex'));
    }
  });
});

describe('rc4', () => {
  // Published RC4 test vectors (Wikipedia, "RC4 test vectors").
  const vectors: [string, string, string][] = [
    ['Key', 'Plaintext', 'bbf316e8d940af0ad3'],
    ['Wiki', 'pedia', '1021bf0420'],
    ['Secret', 'Attack at dawn', '45a01f645fc35b383552544b9bf5'],
  ];
  it.each(vectors)('key %j', (key, plain, cipher) => {
    expect(hex(rc4(enc(key), enc(plain)))).toBe(cipher);
  });

  it('is its own inverse', () => {
    const k = enc('round-trip key');
    const data = enc('some text, longer than one keystream block of 256 bytes '.repeat(8));
    expect(rc4(k, rc4(k, data))).toEqual(data);
  });

  it('rejects an empty key instead of producing output', () => {
    expect(() => rc4(new Uint8Array(0), enc('x'))).toThrow(RangeError);
  });
});
