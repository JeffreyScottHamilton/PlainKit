import { describe, expect, it } from 'vitest';
import { formatColor, formatHsl, formatRgb, hexToRgb, hslToRgb, parseColor, rgbToHex, rgbToHslExact } from './color';

const LEVELS = [0, 1, 17, 51, 102, 127, 128, 153, 204, 254, 255];
const grid = LEVELS.flatMap((r) => LEVELS.flatMap((g) => LEVELS.map((b) => ({ r, g, b }))));

describe('hex', () => {
  it('formats lowercase #rrggbb and parses back exactly', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 170 })).toBe('#ff00aa');
    for (const c of grid) expect(hexToRgb(rgbToHex(c))).toEqual(c);
  });

  it('accepts short form, uppercase and missing hash', () => {
    expect(parseColor('#F0A')).toEqual({ ok: true, rgb: { r: 255, g: 0, b: 170 } });
    expect(parseColor('3a7')).toEqual({ ok: true, rgb: { r: 51, g: 170, b: 119 } });
    expect(parseColor('#1A2B3C')).toEqual({ ok: true, rgb: { r: 26, g: 43, b: 60 } });
  });
});

describe('rgb', () => {
  it('round trips hex -> rgb text -> hex for every sampled color', () => {
    for (const c of grid) {
      const parsed = parseColor(formatRgb(c));
      expect(parsed).toEqual({ ok: true, rgb: c });
      expect(rgbToHex(parsed.ok ? parsed.rgb : c)).toBe(rgbToHex(c));
    }
  });

  it('rejects out-of-range and malformed channels with a message', () => {
    expect(parseColor('rgb(256, 0, 0)')).toMatchObject({ ok: false, error: expect.stringMatching(/0 to 255/) });
    expect(parseColor('rgb(1.5, 0, 0)')).toMatchObject({ ok: false });
    expect(parseColor('rgb(1, 2)')).toMatchObject({ ok: false, error: expect.stringMatching(/#rrggbb/) });
  });
});

describe('hsl', () => {
  it('converts without rounding loss: hex -> hsl -> rgb returns the same color', () => {
    for (const c of grid) expect(hslToRgb(rgbToHslExact(c))).toEqual(c);
  });

  it('parses its own rounded text back to within 3 levels per channel', () => {
    for (const c of grid) {
      const parsed = parseColor(formatHsl(c));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(Math.abs(parsed.rgb.r - c.r)).toBeLessThanOrEqual(3);
      expect(Math.abs(parsed.rgb.g - c.g)).toBeLessThanOrEqual(3);
      expect(Math.abs(parsed.rgb.b - c.b)).toBeLessThanOrEqual(3);
    }
  });

  it('parses known values and validates ranges', () => {
    expect(parseColor('hsl(120, 100%, 25%)')).toEqual({ ok: true, rgb: { r: 0, g: 128, b: 0 } });
    expect(parseColor('hsl(0, 0%, 100%)')).toEqual({ ok: true, rgb: { r: 255, g: 255, b: 255 } });
    expect(parseColor('hsl(400, 10%, 10%)')).toMatchObject({ ok: false, error: expect.stringMatching(/Hue/) });
    expect(parseColor('hsl(120, 150%, 10%)')).toMatchObject({ ok: false, error: expect.stringMatching(/0% to 100%/) });
    expect(parseColor('hsl(120, 50, 10)')).toMatchObject({ ok: false, error: expect.stringMatching(/0% to 100%/) });
  });
});

describe('input validation', () => {
  it('refuses alpha and unknown text instead of guessing', () => {
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toMatchObject({ ok: false, error: expect.stringMatching(/Transparency/) });
    expect(parseColor('blue')).toMatchObject({ ok: false, error: expect.stringMatching(/#rrggbb/) });
    expect(parseColor('#12')).toMatchObject({ ok: false });
    expect(parseColor('   ')).toMatchObject({ ok: false, error: 'Enter a color.' });
  });

  it('formatColor follows the chosen display format', () => {
    expect(formatColor('#ff0000', 'hex')).toBe('#ff0000');
    expect(formatColor('#ff0000', 'rgb')).toBe('rgb(255, 0, 0)');
    expect(formatColor('#ff0000', 'hsl')).toBe('hsl(0, 100%, 50%)');
  });
});
