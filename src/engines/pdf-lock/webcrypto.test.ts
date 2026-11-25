// @vitest-environment node
import { createCipheriv, randomBytes as nodeRandom } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aesCbcDecryptNoPad, aesCbcEncryptNoPad, concat, sha } from './webcrypto';

const oracleEncrypt = (key: Uint8Array, iv: Uint8Array, data: Uint8Array) => {
  const c = createCipheriv(key.length === 16 ? 'aes-128-cbc' : 'aes-256-cbc', key, iv);
  c.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([c.update(data), c.final()]));
};

describe('no-padding AES-CBC (checked against node:crypto)', () => {
  it('encrypts whole blocks exactly like the unpadded oracle', async () => {
    for (const blocks of [1, 2, 3, 4]) {
      const key = new Uint8Array(nodeRandom(32));
      const iv = new Uint8Array(nodeRandom(16));
      const data = new Uint8Array(nodeRandom(16 * blocks));
      expect(await aesCbcEncryptNoPad(key, iv, data)).toEqual(oracleEncrypt(key, iv, data));
    }
  });

  it('decrypts whole blocks back to the plaintext (AES-256 and AES-128)', async () => {
    for (const keyLen of [16, 32]) {
      const key = new Uint8Array(nodeRandom(keyLen));
      const iv = new Uint8Array(nodeRandom(16));
      const plain = new Uint8Array(nodeRandom(48));
      const cipher = oracleEncrypt(key, iv, plain);
      expect(await aesCbcDecryptNoPad(key, iv, cipher)).toEqual(plain);
    }
  });

  it('NIST SP 800-38A F.2.5 (CBC-AES256), first two blocks', async () => {
    const hx = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
    const key = hx('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4');
    const iv = hx('000102030405060708090a0b0c0d0e0f');
    const plain = hx('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e51');
    const cipher = hx('f58c4c04d6e5f1ba779eabfb5f7bfbd69cfc4e967edb808d679f777bc6702c7d');
    expect(await aesCbcEncryptNoPad(key, iv, plain)).toEqual(cipher);
    expect(await aesCbcDecryptNoPad(key, iv, cipher)).toEqual(plain);
  });

  it('rejects input that is not whole blocks', async () => {
    await expect(aesCbcEncryptNoPad(new Uint8Array(16), new Uint8Array(16), new Uint8Array(5))).rejects.toThrow(RangeError);
  });
});

describe('sha and concat', () => {
  it('sha-256 of "abc" matches the FIPS 180 vector', async () => {
    const d = await sha(256, new TextEncoder().encode('abc'));
    expect(Buffer.from(d).toString('hex')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('concat joins parts in order', () => {
    expect(concat(new Uint8Array([1]), new Uint8Array([2, 3]), new Uint8Array(0))).toEqual(new Uint8Array([1, 2, 3]));
  });
});
