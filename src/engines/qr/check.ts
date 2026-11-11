import jsQR from 'jsqr';
import type { Rgb } from './render';

/** WCAG relative luminance of an sRGB color. */
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function parseHex(s: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Human warnings for the chosen foreground and background. An empty list means no warning. */
export function colorWarnings(fg: Rgb, bg: Rgb): string[] {
  const out: string[] = [];
  const ratio = contrastRatio(fg, bg);
  if (ratio < 4) out.push(`Contrast is ${ratio.toFixed(1)}:1. Scanners expect at least 4:1. Use a darker code color or a lighter background.`);
  if (luminance(fg) > luminance(bg)) out.push('Many scanners need dark modules on a light background. Your code is lighter than its background.');
  return out;
}

/** Decodes RGBA pixels with jsQR. Returns the decoded string, or null when no code is found. */
export function readBack(rgba: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(rgba, width, height)?.data ?? null;
}
