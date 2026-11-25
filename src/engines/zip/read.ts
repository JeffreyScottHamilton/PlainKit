import { ToolError } from '@/lib/errors';
import { sanitizePath } from './path';
import type { ZipEntry } from './types';

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const EOCD_MIN = 22;
const CEN_MIN = 46;

export const corrupt = () =>
  new ToolError('zip-corrupt', 'This ZIP is damaged or incomplete, so its contents cannot be read.', 'Check the file. Try a fresh copy of the archive.');

/** DOS date/time to local epoch ms. Returns null for fields that are not a real date. */
export function dosToMs(date: number, time: number): number | null {
  const month = (date >> 5) & 15;
  const day = date & 31;
  if (month < 1 || month > 12 || day < 1) return null;
  return new Date((date >> 9) + 1980, month - 1, day, time >> 11, (time >> 5) & 63, (time & 31) * 2).getTime();
}

/**
 * Reads the central directory only (no decompression). Validates every offset against the file size,
 * so a damaged or hostile archive fails with a ToolError rather than reading out of bounds.
 * ZIP64 and other unsupported structures are reported as errors, never guessed.
 */
export function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - EOCD_MIN; i >= Math.max(0, bytes.length - EOCD_MIN - 0xffff); i--) {
    if (dv.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ToolError('zip-invalid', 'This file is not a ZIP archive.', 'Choose a .zip file.');

  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ToolError('zip64-unsupported', 'ZIP64 archives are not supported.', 'Use a ZIP made with standard settings, or split it.');
  }
  if (cdOffset + cdSize > eocd) throw corrupt();

  const out: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + CEN_MIN > bytes.length || dv.getUint32(p, true) !== CEN) throw corrupt();
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    if (compressedSize === 0xffffffff || size === 0xffffffff) {
      throw new ToolError('zip64-unsupported', 'ZIP64 archives are not supported.', 'Use a ZIP made with standard settings, or split it.');
    }
    const start = p + CEN_MIN;
    const end = start + nameLen;
    if (end > bytes.length) throw corrupt();
    const name = new TextDecoder().decode(bytes.subarray(start, end));
    const isDir = name.endsWith('/');
    const clean = sanitizePath(name);
    out.push({
      name,
      path: isDir && clean ? `${clean}/` : clean,
      isDir,
      size,
      compressedSize,
      modified: dosToMs(dv.getUint16(p + 14, true), dv.getUint16(p + 12, true)),
      unsupported: flags & 1 ? 'encrypted' : method !== 0 && method !== 8 ? 'method' : null,
      method,
    });
    p = end + extraLen + commentLen;
  }
  return out;
}
