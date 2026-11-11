import type { ImageMime } from '@/engines/image/sniff';
import type { OutputMime } from '@/engines/image/types';

/** Tested format matrix. Only these pairs are offered. Same-format pairs are excluded. */
export type InputRow = { mime: ImageMime; label: string; note: string; needsAvifDecode?: true };
export type OutputCol = { mime: OutputMime; label: string; ext: string; alpha: boolean; lossy: boolean };

export const CONVERT_INPUTS: readonly InputRow[] = [
  { mime: 'image/jpeg', label: 'JPEG', note: 'Lossy source. No transparency.' },
  { mime: 'image/png', label: 'PNG', note: 'Transparency is kept in PNG and WebP output.' },
  { mime: 'image/webp', label: 'WebP', note: 'Transparency is kept in PNG and WebP output.' },
  { mime: 'image/gif', label: 'GIF', note: 'First frame only. Animation is not kept.' },
  { mime: 'image/bmp', label: 'BMP', note: 'Uncompressed input. Usually much smaller as JPEG, PNG or WebP.' },
  { mime: 'image/avif', label: 'AVIF', note: 'Only when this browser can decode AVIF.', needsAvifDecode: true },
];

export const CONVERT_OUTPUTS: readonly OutputCol[] = [
  { mime: 'image/jpeg', label: 'JPEG', ext: 'jpg', alpha: false, lossy: true },
  { mime: 'image/png', label: 'PNG', ext: 'png', alpha: true, lossy: false },
  { mime: 'image/webp', label: 'WebP', ext: 'webp', alpha: true, lossy: true },
];

/** Every input to every output, except converting a format to itself. */
export const CONVERT_MATRIX: Readonly<Record<ImageMime, readonly OutputMime[]>> = {
  'image/jpeg': ['image/png', 'image/webp'],
  'image/png': ['image/jpeg', 'image/webp'],
  'image/webp': ['image/jpeg', 'image/png'],
  'image/gif': ['image/jpeg', 'image/png', 'image/webp'],
  'image/bmp': ['image/jpeg', 'image/png', 'image/webp'],
  'image/avif': ['image/jpeg', 'image/png', 'image/webp'],
};

export function isConvertInput(m: ImageMime | null | undefined): m is ImageMime {
  return !!m && m in CONVERT_MATRIX;
}

export function outputCol(mime: OutputMime): OutputCol {
  const col = CONVERT_OUTPUTS.find((o) => o.mime === mime);
  if (!col) throw new Error(`Unknown output ${mime}`);
  return col;
}

/** Targets offered for an input. Same-format pairs are not offered. */
export function targetsFor(input: ImageMime): readonly OutputMime[] {
  return CONVERT_MATRIX[input];
}

/** Input can carry transparency, so JPEG output needs a deliberate background. */
export function mayHaveAlpha(input: ImageMime): boolean {
  return input === 'image/png' || input === 'image/webp' || input === 'image/gif' || input === 'image/avif';
}
