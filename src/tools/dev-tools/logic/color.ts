export type Rgba = { r: number; g: number; b: number; a: number };
export type ColorParse = { ok: true; color: Rgba; hadAlpha: boolean } | { ok: false; message: string };

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseColor(input: string): ColorParse {
  const s = input.trim();
  if (s === '') return { ok: false, message: 'Enter a color, for example #1E90FF, rgb(30, 144, 255), or hsl(210 100% 56%).' };
  const hex = HEX.exec(s);
  if (hex) {
    let h = hex[1] ?? '';
    if (h.length <= 4) h = Array.from(h, (c) => c + c).join('');
    const ch = (i: number) => parseInt(h.slice(i, i + 2), 16);
    const hadAlpha = h.length === 8;
    return { ok: true, hadAlpha, color: { r: ch(0), g: ch(2), b: ch(4), a: hadAlpha ? ch(6) / 255 : 1 } };
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(s);
  if (!fn) return { ok: false, message: 'Not recognized. Use #RGB, #RRGGBB, #RRGGBBAA, rgb(r, g, b), or hsl(h, s%, l%).' };
  const name = (fn[1] ?? '').toLowerCase();
  const parts = (fn[2] ?? '').split(/[\s,/]+/).filter((p) => p !== '');
  if (parts.length !== 3 && parts.length !== 4) return { ok: false, message: `${name}() needs 3 values, plus an optional alpha.` };
  const num = (p: string): number | null => (/^-?\d+(\.\d+)?%?$/.test(p) ? Number(p.replace('%', '')) : null);
  const vals = parts.map(num);
  if (vals.some((v) => v === null)) return { ok: false, message: `Could not read one of the values in ${name}(). Use numbers only.` };
  const [x = 0, y = 0, z = 0] = vals as number[];
  const hadAlpha = parts.length === 4;
  let a = 1;
  if (hadAlpha) {
    const ap = parts[3] ?? '';
    a = ap.endsWith('%') ? Number(ap.slice(0, -1)) / 100 : Number(ap);
    if (a < 0 || a > 1) return { ok: false, message: 'Alpha must be between 0 and 1 (or 0% to 100%).' };
  }
  if (name.startsWith('rgb')) {
    for (const [label, v] of [['red', x], ['green', y], ['blue', z]] as const) {
      if (v < 0 || v > 255) return { ok: false, message: `${label} must be 0-255, got ${v}.` };
    }
    return { ok: true, hadAlpha, color: { r: Math.round(x), g: Math.round(y), b: Math.round(z), a } };
  }
  const h = ((x % 360) + 360) % 360;
  if (y < 0 || y > 100 || z < 0 || z > 100) return { ok: false, message: 'Saturation and lightness must be 0% to 100%.' };
  return { ok: true, hadAlpha, color: { ...hslToRgb(h, y, z), a } };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = h / 60;
  const xv = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, xv, 0] : hp < 2 ? [xv, c, 0] : hp < 3 ? [0, c, xv] : hp < 4 ? [0, xv, c] : hp < 5 ? [xv, 0, c] : [c, 0, xv];
  const m = ln - c / 2;
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();

export function toHex(c: Rgba, withAlpha: boolean): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${withAlpha ? hex2(c.a * 255) : ''}`;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG 2.x contrast ratio. Alpha is ignored. */
export function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
