import { createHash } from 'node:crypto';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { assertWithinCap, MAX_TOTAL_BYTES } from './guard';
import { isAlreadyCompressed, levelFor } from './policy';
import { baseName, sanitizePath, uniquePaths } from './path';
import { readCentralDirectory } from './read';
import { mimeFor } from './mime';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const nested = () =>
  zipSync({
    'docs/readme.txt': strToU8('hello'),
    'docs/sub/data.csv': strToU8('a,b\n1,2\n'),
    'pic.jpg': strToU8('not really a jpeg'),
  });

/** Flips the encryption flag (bit 0) on every central directory entry. */
function encrypt(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  const dv = new DataView(out.buffer);
  for (let i = 0; i + 46 <= out.length; i++) {
    if (dv.getUint32(i, true) === 0x02014b50) dv.setUint16(i + 8, dv.getUint16(i + 8, true) | 1, true);
  }
  return out;
}

describe('sanitizePath', () => {
  it('strips traversal and leading slashes', () => {
    expect(sanitizePath('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizePath('/abs/file.txt')).toBe('abs/file.txt');
    expect(sanitizePath('a/../b/./c.txt')).toBe('a/b/c.txt');
    expect(sanitizePath('..\\win\\..\\x.txt')).toBe('win/x.txt');
    expect(sanitizePath('C:/boot.ini')).toBe('boot.ini');
  });
  it('returns empty when nothing usable remains', () => {
    expect(sanitizePath('../')).toBe('');
    expect(sanitizePath('/')).toBe('');
  });
  it('drops control characters', () => {
    expect(sanitizePath('a\u0007b.txt')).toBe('ab.txt');
  });
});

describe('uniquePaths and baseName', () => {
  it('suffixes duplicates before the extension', () => {
    expect(uniquePaths(['a.txt', 'a.txt', 'a.txt', 'b'])).toEqual(['a.txt', 'a (2).txt', 'a (3).txt', 'b']);
  });
  it('takes the last segment', () => {
    expect(baseName('docs/sub/data.csv')).toBe('data.csv');
  });
});

describe('levelFor', () => {
  it('stores already-compressed formats even when Best is chosen', () => {
    expect(levelFor('photo.JPG', 'best')).toBe(0);
    expect(levelFor('movie.mp4', 'normal')).toBe(0);
    expect(isAlreadyCompressed('doc.pdf')).toBe(true);
  });
  it('maps modes for other files', () => {
    expect(levelFor('notes.txt', 'store')).toBe(0);
    expect(levelFor('notes.txt', 'normal')).toBe(6);
    expect(levelFor('notes.txt', 'best')).toBe(9);
    expect(levelFor('README', 'best')).toBe(9);
  });
});

describe('mimeFor', () => {
  it('guesses from the extension and falls back to octet-stream', () => {
    expect(mimeFor('docs/data.CSV')).toBe('text/csv');
    expect(mimeFor('x.unknownext')).toBe('application/octet-stream');
    expect(mimeFor('noext')).toBe('application/octet-stream');
  });
});

describe('readCentralDirectory', () => {
  it('lists nested entries with sizes, dirs and dates, without changing the input', () => {
    const bytes = nested();
    const before = sha(bytes);
    const entries = readCentralDirectory(bytes);
    expect(entries.map((e) => e.path)).toEqual(['docs/readme.txt', 'docs/sub/data.csv', 'pic.jpg']);
    expect(entries[1]).toMatchObject({ isDir: false, size: 8, unsupported: null, method: 8 });
    expect(entries[0]!.modified).not.toBeNull();
    expect(sha(bytes)).toBe(before);
  });
  it('lists directory entries with a trailing slash', () => {
    const bytes = zipSync({ 'folder/': new Uint8Array(0), 'folder/a.txt': strToU8('x') });
    const entries = readCentralDirectory(bytes);
    expect(entries[0]).toMatchObject({ isDir: true, path: 'folder/' });
  });
  it('marks encrypted entries as unsupported', () => {
    const entries = readCentralDirectory(encrypt(nested()));
    expect(entries.every((e) => e.unsupported === 'encrypted')).toBe(true);
  });
  it('rejects bytes that are not a ZIP', () => {
    expect(() => readCentralDirectory(strToU8('plain text, not a zip at all'))).toThrow(ToolError);
  });
  it('rejects a truncated archive without reading out of bounds', () => {
    const bytes = nested();
    const cut = bytes.slice(0, bytes.length - 30);
    expect(() => readCentralDirectory(cut)).toThrow(ToolError);
  });
  it('rejects a central directory that points past the file', () => {
    const bytes = nested();
    const dv = new DataView(bytes.buffer);
    const eocd = bytes.length - 22;
    dv.setUint32(eocd + 16, 0xfffff, true);
    expect(() => readCentralDirectory(bytes)).toThrow(ToolError);
  });
  it('round-trips the content that fflate extracts', () => {
    const files = unzipSync(nested());
    expect(new TextDecoder().decode(files['docs/sub/data.csv'])).toBe('a,b\n1,2\n');
  });
});

describe('bomb guard', () => {
  it('refuses a declared total over the cap with a clear message', () => {
    expect(() => assertWithinCap(MAX_TOTAL_BYTES + 1, 'The archive')).toThrow(/over the 2\.00 GB limit/);
    expect(() => assertWithinCap(MAX_TOTAL_BYTES, 'The archive')).not.toThrow();
  });
});
