// @vitest-environment node
import { describe, expect, it } from 'vitest';
import exifr from 'exifr';
import { ToolError } from '../../lib/errors';
import { listSegments } from './segments';
import { stripMetadata } from './strip';
import { verifyClean } from './verify';
import { readMetadata } from './read';
import { readIfd0, tiffOf } from './tiff';
import { ascii } from './bytes';
import { b64, jpegWithMetadata, pngWithMetadata, TINY_JPEG_B64, TINY_WEBP_B64, webpWithMetadata } from './testdata';
import { cleanFile, verdictOf } from './clean';

const KEEP_ALL = { keepIcc: true, keepOrientation: false };
const kinds = (b: Uint8Array) => listSegments(b).segments.map((s) => s.kind);
const scan = (b: Uint8Array) => listSegments(b).tail; // JPEG: scan data and EOI, verbatim

async function gps(b: Uint8Array) {
  return (await exifr.parse(b, { gps: true, tiff: true, exif: true })) ?? undefined;
}

describe('segments: detection without decoding', () => {
  it('finds EXIF, XMP, IPTC, comment and JFIF in a JPEG', () => {
    const jpg = jpegWithMetadata({ xmp: true, iptc: true, comment: true });
    // Injected after SOI, before the original APP0 JFIF (kept).
    expect(kinds(jpegWithMetadata({ gps: true, xmp: true, iptc: true, comment: true })).slice(0, 5)).toEqual(['exif', 'xmp', 'iptc', 'comment', 'keep']);
    expect(kinds(jpg).slice(0, 3)).toEqual(['xmp', 'iptc', 'comment']);
  });

  it('finds ICC in a JPEG and reports it as a color profile', () => {
    const seg = listSegments(jpegWithMetadata({ icc: true })).segments.find((s) => s.kind === 'icc');
    expect(seg?.label).toBe('Color profile');
  });

  it('finds tEXt, iTXt XMP, eXIf and tIME in a PNG', () => {
    const k = kinds(pngWithMetadata({ text: true, xmp: true, exif: true, time: true }));
    expect(k).toEqual(['keep', 'keep', 'text', 'xmp', 'exif', 'time', 'keep']); // IHDR, IDAT, ..., IEND
  });

  it('finds EXIF and XMP chunks in a WebP', () => {
    const k = kinds(webpWithMetadata(0x0c, { exif: true, xmp: true }));
    expect(k).toEqual(['keep', 'keep', 'exif', 'xmp']);
  });

  it('rejects truncated and corrupt input with a ToolError, never a crash', () => {
    const jpg = jpegWithMetadata({ xmp: true });
    expect(() => listSegments(jpg.subarray(0, 40))).toThrow(ToolError);
    const png = pngWithMetadata({ text: true });
    expect(() => listSegments(png.subarray(0, png.length - 9))).toThrow(ToolError);
    const webp = webpWithMetadata(0, { exif: true });
    expect(() => listSegments(webp.subarray(0, 30))).toThrow(ToolError);
    const garbage = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01]);
    expect(() => listSegments(garbage)).toThrow(ToolError);
    expect(() => listSegments(new TextEncoder().encode('GIF89a-not-supported'))).toThrow(ToolError);
  });
});

describe('strip: lossless removal', () => {
  it('removes EXIF with GPS from a JPEG and keeps the image data byte-identical', async () => {
    const before = jpegWithMetadata({ gps: true, xmp: true, iptc: true, comment: true });
    expect(await gps(before)).toHaveProperty('latitude');
    const after = stripMetadata(before, KEEP_ALL);
    expect(await gps(after)).toBeUndefined();
    expect(Buffer.from(scan(after)).equals(Buffer.from(scan(before)))).toBe(true);
    expect(kinds(after)).not.toContain('exif');
    expect(kinds(after)).not.toContain('xmp');
    expect(kinds(after)).not.toContain('iptc');
    expect(kinds(after)).not.toContain('comment');
    expect(await verifyClean(after)).toEqual({ clean: true, remaining: [], keptOrientation: false });
  });

  it('removes JPEG metadata but keeps ICC when keepIcc is true', () => {
    const out = stripMetadata(jpegWithMetadata({ icc: true, gps: true }), KEEP_ALL);
    expect(kinds(out)).toContain('icc');
    expect(kinds(out)).not.toContain('exif');
  });

  it('removes ICC when keepIcc is false', () => {
    const out = stripMetadata(jpegWithMetadata({ icc: true }), { keepIcc: false, keepOrientation: false });
    expect(kinds(out)).not.toContain('icc');
  });

  it('keepOrientation writes only the Orientation tag, so the picture is not turned sideways', async () => {
    const before = jpegWithMetadata({ gps: true });
    const out = stripMetadata(before, { keepIcc: true, keepOrientation: true });
    const exif = listSegments(out).segments.filter((s) => s.kind === 'exif');
    expect(exif).toHaveLength(1);
    const tiff = tiffOf(out.subarray(exif[0]!.payload, exif[0]!.payloadEnd));
    expect(readIfd0(tiff)).toEqual({ tags: [0x0112], orientation: 6 });
    expect(await gps(out)).toEqual({ Orientation: 'Rotate 90 CW' });
    const verdict = await verifyClean(out);
    expect(verdict.clean).toBe(true);
    expect(verdict.keptOrientation).toBe(true);
    expect(Buffer.from(scan(out)).equals(Buffer.from(scan(before)))).toBe(true);
  });

  it('keepOrientation with orientation 1 keeps nothing', () => {
    const out = stripMetadata(jpegWithMetadata({ orientation: 1 }), { keepIcc: true, keepOrientation: true });
    expect(kinds(out)).not.toContain('exif');
  });

  it('removes text, iTXt XMP, eXIf and tIME from a PNG and keeps IDAT bytes identical', async () => {
    const before = pngWithMetadata({ text: true, xmp: true, exif: true, time: true });
    const after = stripMetadata(before, KEEP_ALL);
    expect(kinds(before)).toEqual(['keep', 'keep', 'text', 'xmp', 'exif', 'time', 'keep']); // IHDR IDAT ... IEND
    expect(kinds(after)).toEqual(['keep', 'keep', 'keep']); // IHDR IDAT IEND
    const chunk = (b: Uint8Array, i: number) => b.subarray(listSegments(b).segments[i]!.start, listSegments(b).segments[i]!.end);
    expect(Buffer.from(chunk(after, 1)).equals(Buffer.from(chunk(before, 1)))).toBe(true); // IDAT incl. its CRC
    expect(await verifyClean(after)).toMatchObject({ clean: true });
  });

  it('clears VP8X flags and fixes the RIFF size for a WebP, and keeps the image chunk byte-identical', async () => {
    const before = webpWithMetadata(0x0c | 0x20, { exif: true, xmp: true, icc: true });
    const after = stripMetadata(before, { keepIcc: false, keepOrientation: false });
    const riff = new DataView(after.buffer, after.byteOffset, after.byteLength).getUint32(4, true);
    expect(riff).toBe(after.length - 8);
    const vp8x = listSegments(after).segments[0]!;
    expect(after[vp8x.payload]).toBe(0x00); // EXIF, XMP and ICC bits all cleared
    expect(kinds(after)).toEqual(['keep', 'keep']);
    const find = (b: Uint8Array) => listSegments(b).segments.find((x) => ascii(b, x.start, 4) === 'VP8L')!;
    const img = find(before);
    const imgAfter = find(after);
    expect(Buffer.from(after.subarray(imgAfter.start, imgAfter.end)).equals(Buffer.from(before.subarray(img.start, img.end)))).toBe(true);
    expect(await verifyClean(after)).toMatchObject({ clean: true });
  });

  it('keeps the WebP ICC chunk and flag when keepIcc is true', () => {
    const out = stripMetadata(webpWithMetadata(0x20, { icc: true, exif: true }), { keepIcc: true, keepOrientation: false });
    expect(kinds(out)).toEqual(['keep', 'icc', 'keep']);
    const vp8x = listSegments(out).segments[0]!;
    expect(out[vp8x.payload]).toBe(0x20);
  });

  it('stripping an already-clean file is a no-op', () => {
    const clean = [b64(TINY_JPEG_B64), pngWithMetadata({}), webpWithMetadata(0)];
    for (const c of clean) expect(Buffer.from(stripMetadata(c, KEEP_ALL)).equals(Buffer.from(c))).toBe(true);
  });

  it('refuses truncated input with a ToolError', () => {
    expect(() => stripMetadata(jpegWithMetadata({ gps: true }).subarray(0, 30), KEEP_ALL)).toThrow(ToolError);
  });
});

describe('verify', () => {
  it('fails when GPS, XMP or IPTC is still present, and names what remains', async () => {
    const v = await verifyClean(jpegWithMetadata({ gps: true, xmp: true }));
    expect(v.clean).toBe(false);
    expect(v.remaining).toEqual(expect.arrayContaining(['EXIF', 'XMP', 'GPS location']));
  });

  it('fails on unreadable output instead of reporting it clean', async () => {
    const v = await verifyClean(new Uint8Array([1, 2, 3]));
    expect(v.clean).toBe(false);
  });
});

describe('read and clean wrappers', () => {
  it('reports location and grouped fields, and flags cleanable formats', async () => {
    const r = await readMetadata(new Blob([jpegWithMetadata({ gps: true })], { type: 'image/jpeg' }));
    expect(r.format).toBe('image/jpeg');
    expect(r.cleanable).toBe(true);
    expect(r.hasLocation).toBe(true);
    expect(r.groups.find((g) => g.title === 'Location')?.fields[0]?.value).toBe('51.50000, -0.11667');
    expect(r.groups.find((g) => g.title === 'Camera')?.fields).toEqual([{ name: 'Make', value: 'TestCam' }]);
  });

  it('returns an unsupported state for non-images without throwing', async () => {
    const r = await readMetadata(new Blob([new TextEncoder().encode('hello')]));
    expect(r.format).toBeNull();
  });

  it('cleanFile returns a verified output and leaves the input bytes unchanged', async () => {
    const input = new Blob([jpegWithMetadata({ gps: true })], { type: 'image/jpeg' });
    const before = Buffer.from(await input.arrayBuffer());
    const { blob, verdict } = await cleanFile(input, 'image/jpeg', KEEP_ALL);
    expect(verdict.clean).toBe(true);
    expect(verdictOf(blob)?.clean).toBe(true);
    expect(Buffer.from(await input.arrayBuffer()).equals(before)).toBe(true);
    expect((await blob.arrayBuffer()).byteLength).toBeLessThan(before.length);
  });
});
