import type { ImageMime } from '@/engines/image/sniff';
import type { OutputMime } from '@/engines/image/types';
import type { ExtraMime } from '@/engines/image/extra';

/** Everything Convert can write for images: the canvas formats plus the extra encoders. */
export type ConvertTarget = OutputMime | ExtraMime;

/** Tested format matrix. Only these pairs are offered. Same-format pairs are excluded. */
export type InputRow = { mime: ImageMime; label: string; note: string; needsAvifDecode?: true };
export type OutputCol = { mime: ConvertTarget; label: string; ext: string; alpha: boolean; lossy: boolean };

export const CONVERT_INPUTS: readonly InputRow[] = [
  { mime: 'image/jpeg', label: 'JPEG', note: 'Lossy source. No transparency.' },
  { mime: 'image/png', label: 'PNG', note: 'Transparency is kept in PNG and WebP output.' },
  { mime: 'image/webp', label: 'WebP', note: 'Transparency is kept in PNG and WebP output.' },
  { mime: 'image/gif', label: 'GIF', note: 'First frame only. Animation is not kept.' },
  { mime: 'image/bmp', label: 'BMP', note: 'Uncompressed input. Usually much smaller as JPEG, PNG or WebP.' },
  { mime: 'image/avif', label: 'AVIF', note: 'Only when this browser can decode AVIF.', needsAvifDecode: true },
  { mime: 'image/heic', label: 'HEIC / HEIF', note: 'iPhone photos. Main picture only: Live Photo motion, bursts and depth are not kept. Chrome and Firefox download a 2 MB decoder on first use.' },
  { mime: 'image/tiff', label: 'TIFF', note: 'First page only. Uncommon TIFF variants may not decode.' },
  { mime: 'image/svg+xml', label: 'SVG', note: 'Drawn at its own size and turned into pixels. Scripts and outside files in the SVG are ignored.' },
];

export const CONVERT_OUTPUTS: readonly OutputCol[] = [
  { mime: 'image/jpeg', label: 'JPEG', ext: 'jpg', alpha: false, lossy: true },
  { mime: 'image/png', label: 'PNG', ext: 'png', alpha: true, lossy: false },
  { mime: 'image/webp', label: 'WebP', ext: 'webp', alpha: true, lossy: true },
  { mime: 'image/avif', label: 'AVIF', ext: 'avif', alpha: true, lossy: true },
  { mime: 'image/gif', label: 'GIF', ext: 'gif', alpha: true, lossy: false },
  { mime: 'image/bmp', label: 'BMP', ext: 'bmp', alpha: false, lossy: false },
  { mime: 'image/tiff', label: 'TIFF', ext: 'tiff', alpha: true, lossy: false },
  { mime: 'image/x-icon', label: 'ICO (icon)', ext: 'ico', alpha: true, lossy: false },
];

const ALL_TARGETS: readonly ConvertTarget[] = CONVERT_OUTPUTS.map((o) => o.mime);
const INPUT_MIMES: readonly ImageMime[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif', 'image/heic', 'image/tiff', 'image/svg+xml'];

/** Every input to every output, except converting a format to itself. */
export const CONVERT_MATRIX: Readonly<Record<ImageMime, readonly ConvertTarget[]>> = Object.fromEntries(
  INPUT_MIMES.map((i) => [i, ALL_TARGETS.filter((o) => o !== i)]),
) as unknown as Record<ImageMime, readonly ConvertTarget[]>;

export function isConvertInput(m: ImageMime | null | undefined): m is ImageMime {
  return !!m && m in CONVERT_MATRIX;
}

export function outputCol(mime: ConvertTarget): OutputCol {
  const col = CONVERT_OUTPUTS.find((o) => o.mime === mime);
  if (!col) throw new Error(`Unknown output ${mime}`);
  return col;
}

/** Targets offered for an input. Same-format pairs are not offered. */
export function targetsFor(input: ImageMime): readonly ConvertTarget[] {
  return CONVERT_MATRIX[input];
}

/** Input can carry transparency, so JPEG output needs a deliberate background. */
export function mayHaveAlpha(input: ImageMime): boolean {
  return input === 'image/png' || input === 'image/webp' || input === 'image/gif' || input === 'image/avif' || input === 'image/heic' || input === 'image/tiff' || input === 'image/svg+xml';
}
