import { describe, expect, it } from 'vitest';
import { CONVERT_INPUTS, CONVERT_MATRIX, CONVERT_OUTPUTS, isConvertInput, mayHaveAlpha, outputCol, targetsFor } from './matrix';

describe('convert format matrix', () => {
  it('lists the image inputs and outputs, no document/3D/audio/video', () => {
    expect(CONVERT_INPUTS.map((i) => i.mime)).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif', 'image/heic', 'image/tiff', 'image/svg+xml']);
    expect(CONVERT_OUTPUTS.map((o) => o.mime)).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp', 'image/tiff', 'image/x-icon']);
  });

  it('never offers the same format as input and output', () => {
    for (const i of CONVERT_INPUTS) expect(targetsFor(i.mime)).not.toContain(i.mime);
  });

  it('offers every other output', () => {
    expect(targetsFor('image/jpeg')).toHaveLength(7);
    expect(targetsFor('image/heic')).toHaveLength(8);
    expect(targetsFor('image/png')).toContain('image/x-icon');
  });

  it('marks JPEG and BMP as the outputs without alpha', () => {
    expect(CONVERT_OUTPUTS.filter((o) => !o.alpha).map((o) => o.mime)).toEqual(['image/jpeg', 'image/bmp']);
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
