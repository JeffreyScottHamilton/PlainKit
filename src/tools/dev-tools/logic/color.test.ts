import { describe, expect, it } from 'vitest';
import { contrastRatio, hslToRgb, parseColor, rgbToHsl, toHex } from './color';

describe('color', () => {
  it('parses hex 3/4/6/8 digit forms', () => {
    expect(parseColor('#abc')).toMatchObject({ ok: true, color: { r: 170, g: 187, b: 204, a: 1 } });
    const a = parseColor('#11223380');
    expect(a.ok && a.hadAlpha && Math.abs(a.color.a - 0x80 / 255) < 1e-9).toBe(true);
  });
  it('parses rgb() and hsl() and converts', () => {
    expect(parseColor('rgb(255 0 0)')).toMatchObject({ ok: true, color: { r: 255, g: 0, b: 0 } });
    const h = parseColor('hsl(120, 100%, 25%)');
    expect(h).toMatchObject({ ok: true, color: { r: 0, g: 128, b: 0 } });
    expect(rgbToHsl(0, 128, 0)).toEqual({ h: 120, s: 100, l: 25 });
    expect(hslToRgb(120, 100, 25)).toEqual({ r: 0, g: 128, b: 0 });
    expect(toHex({ r: 0, g: 128, b: 0, a: 1 }, false)).toBe('#008000');
  });
  it('gives contrast 21 for black on white', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
  });
  it('reports out-of-range and unknown input', () => {
    expect(parseColor('rgb(300, 0, 0)')).toEqual({ ok: false, message: 'red must be 0-255, got 300.' });
    expect(parseColor('#12').ok).toBe(false);
    expect(parseColor('purple-ish').ok).toBe(false);
  });
});
