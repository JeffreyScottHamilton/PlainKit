import { describe, expect, it } from 'vitest';
import { CONVERT_INPUTS, CONVERT_MATRIX, CONVERT_OUTPUTS, isConvertInput, mayHaveAlpha, outputCol, targetsFor } from './matrix';

describe('convert format matrix', () => {
  it('lists the six inputs and three outputs, no document/3D/audio/video', () => {
    expect(CONVERT_INPUTS.map((i) => i.mime)).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
    expect(CONVERT_OUTPUTS.map((o) => o.mime)).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('never offers the same format as input and output', () => {
    for (const i of CONVERT_INPUTS) expect(targetsFor(i.mime)).not.toContain(i.mime);
  });

  it('offers every other output: two for JPEG/PNG/WebP, three for GIF/BMP/AVIF', () => {
    expect(targetsFor('image/jpeg')).toEqual(['image/png', 'image/webp']);
    expect(targetsFor('image/png')).toEqual(['image/jpeg', 'image/webp']);
    expect(targetsFor('image/webp')).toEqual(['image/jpeg', 'image/png']);
    expect(targetsFor('image/gif')).toHaveLength(3);
    expect(targetsFor('image/avif')).toHaveLength(3);
  });

  it('marks JPEG as the only output without alpha', () => {
    expect(CONVERT_OUTPUTS.filter((o) => !o.alpha).map((o) => o.mime)).toEqual(['image/jpeg']);
    expect(outputCol('image/png').ext).toBe('png');
  });

  it('recognises only matrix inputs', () => {
    expect(isConvertInput('image/gif')).toBe(true);
    expect(isConvertInput(null)).toBe(false);
    expect(CONVERT_MATRIX['image/jpeg']).not.toContain('image/jpeg');
  });

  it('flags inputs that can carry transparency', () => {
    expect(mayHaveAlpha('image/png')).toBe(true);
    expect(mayHaveAlpha('image/jpeg')).toBe(false);
    expect(mayHaveAlpha('image/bmp')).toBe(false);
  });
});
