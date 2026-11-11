import { ToolError } from '@/lib/errors';

export const MAX_SIDE = 16384;
export const MAX_PIXELS = 100_000_000;

/** Refuses decoded sizes that would exhaust memory. Throws ToolError('too-large'). */
export function assertDecodable(width: number, height: number): void {
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new ToolError(
      'too-large',
      `This image is ${width} × ${height} px, which is too large to process in the browser.`,
      'Use an image up to 16384 px per side and 100 megapixels, or resize it first.',
    );
  }
}

/** Longest side capped at maxDimension. Never upscales. */
export function fitWithin(width: number, height: number, maxDimension?: number): { width: number; height: number; scaled: boolean } {
  if (maxDimension === undefined || Math.max(width, height) <= maxDimension) return { width, height, scaled: false };
  const s = maxDimension / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)), scaled: true };
}

/** "#rgb" style input is not accepted: exactly "#rrggbb". Returns lowercase or null. */
export function parseHexColor(value: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(value.trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
}
