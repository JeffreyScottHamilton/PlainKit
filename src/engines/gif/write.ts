// GIF writing and palette reduction. Pure: no browser APIs, so it is unit-tested in Node.
import { GIFEncoder, applyPalette, quantize, type Palette } from 'gifenc';

export type IndexedFrame = { index: Uint8Array; palette: Palette; width: number; height: number; ms: number };

/** Reduces one RGBA frame (fully opaque) to a palette of at most `colors` entries and per-pixel indexes. */
export function quantizeRgba(rgba: Uint8ClampedArray, colors: number): { index: Uint8Array; palette: Palette } {
  const palette = quantize(rgba, colors, { format: 'rgb565' });
  return { index: applyPalette(rgba, palette, 'rgb565'), palette };
}

/** Writes an animated GIF. `loop` = repeat forever; otherwise the animation plays once. Delays are rounded to 10 ms. */
export function writeGif(frames: readonly IndexedFrame[], loop: boolean): Uint8Array {
  const enc = GIFEncoder();
  for (const f of frames) {
    enc.writeFrame(f.index, f.width, f.height, { palette: f.palette, delay: Math.max(10, Math.round(f.ms / 10) * 10), repeat: loop ? 0 : -1 });
  }
  enc.finish();
  return enc.bytes();
}
