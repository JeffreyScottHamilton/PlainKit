export type RGB = { r: number; g: number; b: number };
/** h in degrees 0..360, s and l in percent 0..100. */
export type HSL = { h: number; s: number; l: number };
export type ColorFormat = 'hex' | 'rgb' | 'hsl';
export type ParseResult = { ok: true; rgb: RGB } | { ok: false; error: string };

export const FORMAT_LABEL: Record<ColorFormat, string> = { hex: 'HEX', rgb: 'RGB', hsl: 'HSL' };
export const FORMAT_HINT = 'Use #rrggbb, rgb(r, g, b) or hsl(h, s%, l%).';

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

/** Lowercase "#rrggbb". */
export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Expects "#rrggbb" (lowercase or not). */
export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Unrounded HSL, so hslToRgb(rgbToHslExact(c)) returns c exactly. */
export function rgbToHslExact({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = (gn - bn) / d;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = ln - c / 2;
  return { r: clamp255((r1 + m) * 255), g: clamp255((g1 + m) * 255), b: clamp255((b1 + m) * 255) };
}

export function formatRgb(rgb: RGB): string {
  return `rgb(${clamp255(rgb.r)}, ${clamp255(rgb.g)}, ${clamp255(rgb.b)})`;
}

export function formatHsl(rgb: RGB): string {
  const { h, s, l } = rgbToHslExact(rgb);
  return `hsl(${Math.round(h) % 360}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/** Display string for a stored "#rrggbb" in the chosen format. */
export function formatColor(hex: string, format: ColorFormat): string {
  if (format === 'hex') return hex;
  const rgb = hexToRgb(hex);
  return format === 'rgb' ? formatRgb(rgb) : formatHsl(rgb);
}

const fail = (error: string): ParseResult => ({ ok: false, error });

/** Accepts #rgb, #rrggbb, rgb(r, g, b) and hsl(h, s%, l%). Alpha is refused, not ignored. */
export function parseColor(input: string): ParseResult {
  const t = input.trim().toLowerCase();
  if (!t) return fail('Enter a color.');
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
  if (hex) {
    const h = hex[1] ?? '';
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return { ok: true, rgb: hexToRgb(`#${full}`) };
  }
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(t);
  if (!fn) return fail(FORMAT_HINT);
  const parts = (fn[2] ?? '').split(/\s*[,\s/]\s*/).filter(Boolean);
  if (parts.length === 4) return fail('Use three values. Transparency is not supported.');
  if (parts.length !== 3) return fail(FORMAT_HINT);
  if (fn[1]!.startsWith('rgb')) {
    if (!parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return fail('Red, green and blue must be whole numbers from 0 to 255.');
    const [r, g, b] = parts.map(Number) as [number, number, number];
    return { ok: true, rgb: { r, g, b } };
  }
  const [hs, ss, ls] = parts as [string, string, string];
  if (!/^\d{1,3}(\.\d+)?(deg)?$/.test(hs) || Number.parseFloat(hs) > 360) return fail('Hue must be 0 to 360 degrees.');
  if (!/^\d{1,3}(\.\d+)?%$/.test(ss) || !/^\d{1,3}(\.\d+)?%$/.test(ls) || parseFloat(ss) > 100 || parseFloat(ls) > 100) {
    return fail('Saturation and lightness must be 0% to 100%.');
  }
  return { ok: true, rgb: hslToRgb({ h: Number.parseFloat(hs), s: parseFloat(ss), l: parseFloat(ls) }) };
}
