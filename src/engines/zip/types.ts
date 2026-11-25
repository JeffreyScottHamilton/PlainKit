export type ZipLevel = 'store' | 'normal' | 'best';

/** One entry as written in the archive's central directory. Names are read, never trusted for paths. */
export type ZipEntry = {
  /** Name exactly as stored (used to select entries for extraction). */
  name: string;
  /** Sanitized display path; empty when nothing safe remains (such entries are not listed). */
  path: string;
  isDir: boolean;
  size: number;
  compressedSize: number;
  /** Local time as epoch ms, or null when the DOS date is invalid. */
  modified: number | null;
  /** Why this entry cannot be extracted, or null. */
  unsupported: 'encrypted' | 'method' | null;
  method: number;
};

export type PackFile = { path: string; level: 0 | 6 | 9; blob: Blob };

export type ZipRequest =
  | { type: 'pack'; files: PackFile[] }
  | { type: 'list'; blob: Blob }
  | { type: 'extract'; blob: Blob; names: string[] };

export type ZipResponse =
  | { kind: 'pack'; bytes: Uint8Array }
  | { kind: 'list'; entries: ZipEntry[]; totalSize: number }
  | { kind: 'extract'; files: { path: string; mime: string; bytes: Uint8Array }[] };
