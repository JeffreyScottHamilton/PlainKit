import type { ImageMime } from '@/engines/image/sniff';
import type { EncodeMode, EncodeOptions, OutputMime } from '@/engines/image/types';

export type CompressMode = 'quality' | 'target';
export type FormatChoice = 'keep' | OutputMime;
export type TargetUnit = 'KB' | 'MB';

export type CompressSettings = {
  mode: CompressMode;
  /** 1..100 as the slider shows it. */
  quality: number;
  targetValue: string;
  targetUnit: TargetUnit;
  format: FormatChoice;
  maxDimension: string;
  background: string;
};

export const NAME_OF: Record<ImageMime, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/avif': 'AVIF',
};
export const OUTPUT_CHOICES: readonly OutputMime[] = ['image/jpeg', 'image/png', 'image/webp'];
export const OUTPUT_LABEL: Record<OutputMime, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const EXT: Record<OutputMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const extOf = (m: OutputMime) => EXT[m];

/** Compress takes what the tool's registry accepts: JPEG, PNG, WebP by content. */
export function isCompressInput(m: ImageMime | null | undefined): m is OutputMime {
  return m === 'image/jpeg' || m === 'image/png' || m === 'image/webp';
}

/** Why a sniffed input cannot be compressed. undefined when it can (or is still being checked). */
export function inputIssue(m: ImageMime | null | undefined): string | undefined {
  if (m === undefined || isCompressInput(m)) return undefined;
  if (m === null) return 'Not a JPEG, PNG or WebP image. Choose another file.';
  return `This is ${m === 'image/gif' ? 'GIF' : m === 'image/bmp' ? 'BMP' : 'AVIF'} content. Compress handles JPEG, PNG and WebP. Use Convert for this file.`;
}

export function targetBytesFrom(value: string, unit: TargetUnit): number | null {
  const n = Number(value.trim());
  if (value.trim() === '' || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * (unit === 'KB' ? 1024 : 1024 * 1024));
}

/** undefined = no limit. 'invalid' = not a positive whole number. */
export function parseMaxDimension(value: string): number | undefined | 'invalid' {
  const t = value.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 ? n : 'invalid';
}

/** Keep original resolves to the file's own format. */
export function outputFor(choice: FormatChoice, input: OutputMime): OutputMime {
  return choice === 'keep' ? input : choice;
}

export function buildOptions(
  s: CompressSettings,
  mime: OutputMime,
): { ok: true; options: EncodeOptions; targetBytes: number | null } | { ok: false; error: string } {
  const maxDimension = parseMaxDimension(s.maxDimension);
  if (maxDimension === 'invalid') return { ok: false, error: 'Enter whole pixels, or leave empty.' };
  let mode: EncodeMode;
  let targetBytes: number | null = null;
  if (s.mode === 'target') {
    targetBytes = targetBytesFrom(s.targetValue, s.targetUnit);
    if (targetBytes === null) return { ok: false, error: 'Enter a size above 0.' };
    mode = { kind: 'target', targetBytes };
  } else {
    mode = { kind: 'quality', quality: s.quality / 100 };
  }
  return { ok: true, options: { mime, mode, maxDimension, background: s.background }, targetBytes };
}

export function formatChange(percent: number): string {
  if (percent < 0) return `−${Math.abs(percent)}%`;
  return `+${percent}%`;
}
