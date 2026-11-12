import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { assertSourceSize, decodeSource, isJpeg, setJfifDensity } from './render';

describe('source guards', () => {
  it('accepts a normal photo size', () => {
    expect(() => assertSourceSize(1200, 1600)).not.toThrow();
  });
  it('refuses a source that is too wide or too many pixels', () => {
    expect(() => assertSourceSize(20000, 100)).toThrow(ToolError);
    expect(() => assertSourceSize(8000, 8000)).toThrow(expect.objectContaining({ code: 'image-too-large' }));
  });
  it('rejects a file whose content is not an image', async () => {
    await expect(decodeSource(new Blob(['not an image at all']))).rejects.toMatchObject({ code: 'not-an-image' });
  });
});

describe('JPEG output', () => {
  it('checks start and end markers', () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0xff, 0xd9]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe(false);
  });
  it('writes the print density into a JFIF header only', () => {
    const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
    setJfifDensity(jfif, 300);
    expect([jfif[13], jfif[14], jfif[15], jfif[16], jfif[17]]).toEqual([1, 1, 44, 1, 44]);
    const other = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setJfifDensity(other, 300);
    expect(other[13]).toBe(0);
  });
});
