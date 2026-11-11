import { describe, expect, it } from 'vitest';
import { digestUtf8, toHex } from './hash';

describe('hash', () => {
  it('matches known SHA-1 and SHA-256 vectors for "abc"', async () => {
    expect(toHex(await digestUtf8('abc', 'SHA-1'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(toHex(await digestUtf8('abc', 'SHA-256'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('hashes the UTF-8 bytes, so length is in bytes', async () => {
    expect(toHex(await digestUtf8('', 'SHA-512'))).toHaveLength(128);
    expect(toHex(await digestUtf8('é', 'SHA-384'))).toHaveLength(96);
  });
});
