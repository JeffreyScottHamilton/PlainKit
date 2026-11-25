import type { ZipLevel } from './types';

/** Formats that are already compressed: deflate gains almost nothing, so they are stored. */
const ALREADY_COMPRESSED = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif',
  'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'mp4', 'm4v', 'mov', 'mkv', 'webm',
  'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'zst',
  'pdf', 'docx', 'xlsx', 'pptx', 'epub', 'woff', 'woff2',
]);

const LEVEL: Record<ZipLevel, 0 | 6 | 9> = { store: 0, normal: 6, best: 9 };

export function isAlreadyCompressed(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot > 0 && ALREADY_COMPRESSED.has(path.slice(dot + 1).toLowerCase());
}

/** Deflate level for one file. Already-compressed formats are always stored (level 0). */
export function levelFor(path: string, mode: ZipLevel): 0 | 6 | 9 {
  return mode === 'store' || isAlreadyCompressed(path) ? 0 : LEVEL[mode];
}
