// Test fixtures for metadata: built in code so the tests state exactly what is inside each file.
// Imported by Vitest and by e2e (Node). Relative imports only.
import { PNG } from 'pngjs';
import { be32, concat, crc32, le32 } from './bytes';

export const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDz+x0Lp8ldNYaF0+SulsNC6fJXT2OhdPkrTF5r5i4fzvbU/9k=';
export const TINY_WEBP_B64 = 'UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQjyLXo/+BiOh/AAA=';

export const b64 = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, 'base64'));

type Value = { type: 'ascii'; s: string } | { type: 'short'; v: number } | { type: 'rational'; v: [number, number][] } | { type: 'long'; v: number };
const TYPE_ID = { ascii: 2, short: 3, long: 4, rational: 5 } as const;

function valueBytes(v: Value): Uint8Array {
  if (v.type === 'ascii') return new TextEncoder().encode(v.s + '\0');
  if (v.type === 'short') return Uint8Array.of(v.v & 0xff, v.v >>> 8);
  if (v.type === 'long') return le32(v.v);
  return concat(v.v.map(([n, d]) => concat([le32(n), le32(d)])));
}
function count(v: Value): number {
  if (v.type === 'ascii') return v.s.length + 1;
  if (v.type === 'short') return 1;
  if (v.type === 'long') return 1;
  return v.v.length;
}

/** Encodes one IFD at absolute TIFF offset `at`; out-of-line values follow the entry table. */
function encodeIfd(entries: [number, Value][], at: number, next = 0): { bytes: Uint8Array; length: number } {
  const table = 2 + entries.length * 12 + 4;
  let dataAt = at + table;
  const dataParts: Uint8Array[] = [];
  const rows: Uint8Array[] = [];
  for (const [tag, v] of entries) {
    const bytes = valueBytes(v);
    const row = new Uint8Array(12);
    const dv = new DataView(row.buffer);
    dv.setUint16(0, tag, true);
    dv.setUint16(2, TYPE_ID[v.type], true);
    dv.setUint32(4, count(v), true);
    if (bytes.length <= 4) row.set(bytes, 8);
    else {
      dv.setUint32(8, dataAt, true);
      const padded = bytes.length + (bytes.length & 1);
      const buf = new Uint8Array(padded);
      buf.set(bytes);
      dataParts.push(buf);
      dataAt += padded;
    }
    rows.push(row);
  }
  const head = new Uint8Array(2);
  new DataView(head.buffer).setUint16(0, entries.length, true);
  const tail = le32(next);
  const bytes = concat([head, ...rows, tail, ...dataParts]);
  return { bytes, length: bytes.length };
}

/**
 * Little-endian TIFF with IFD0 entries and an optional GPS sub-IFD (GPS pointer tag 0x8825 added).
 * IFD0 comes first, then the GPS IFD, then their out-of-line values.
 */
export function buildTiff(ifd0: [number, Value][], gps?: [number, Value][]): Uint8Array {
  const header = concat([Uint8Array.of(0x49, 0x49, 0x2a, 0x00), le32(8)]);
  const entries0: [number, Value][] = gps ? [...ifd0, [0x8825, { type: 'long', v: 0 }]] : ifd0;
  const probe = encodeIfd(entries0, 8);
  const gpsAt = 8 + probe.length;
  const ifdBytes = gps ? encodeIfd(entries0.map((e) => (e[0] === 0x8825 ? [e[0], { type: 'long', v: gpsAt }] : e)) as [number, Value][], 8) : probe;
  if (!gps) return concat([header, ifdBytes.bytes]);
  return concat([header, ifdBytes.bytes, encodeIfd(gps, gpsAt).bytes]);
}

/** Sample GPS position: 51.5°N 0.1°W with Orientation 6, Make "TestCam". */
export const GPS_TIFF = (): Uint8Array =>
  buildTiff(
    [
      [0x010f, { type: 'ascii', s: 'TestCam' }],
      [0x0112, { type: 'short', v: 6 }],
    ],
    [
      [0x0001, { type: 'ascii', s: 'N' }],
      [0x0002, { type: 'rational', v: [[51, 1], [30, 1], [0, 1]] }],
      [0x0003, { type: 'ascii', s: 'W' }],
      [0x0004, { type: 'rational', v: [[0, 1], [7, 1], [0, 1]] }],
    ],
  );

export function app(marker: number, payload: Uint8Array): Uint8Array {
  const len = payload.length + 2;
  return concat([Uint8Array.of(0xff, marker, len >>> 8, len & 0xff), payload]);
}

const te = (s: string) => new TextEncoder().encode(s);

export type JpegOptions = { gps?: boolean; orientation?: number; xmp?: boolean; iptc?: boolean; comment?: boolean; icc?: boolean };

/**
 * Inserts metadata segments after the JPEG SOI of the tiny baseline image. The JFIF APP0 and the image data stay as they are.
 */
export function jpegWithMetadata(opts: JpegOptions = {}): Uint8Array {
  const base = b64(TINY_JPEG_B64);
  const parts: Uint8Array[] = [base.subarray(0, 2)];
  if (opts.gps) parts.push(app(0xe1, concat([te('Exif\0\0'), GPS_TIFF()])));
  else if (opts.orientation !== undefined) parts.push(app(0xe1, concat([te('Exif\0\0'), buildTiff([[0x0112, { type: 'short', v: opts.orientation }]])])));
  if (opts.xmp) {
    const xml =
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="TestCam XMP"/></rdf:RDF></x:xmpmeta>';
    parts.push(app(0xe1, concat([te('http://ns.adobe.com/xap/1.0/\0'), te(xml)])));
  }
  if (opts.iptc) parts.push(app(0xed, concat([te('Photoshop 3.0\0'), te('8BIM'), new Uint8Array(16), te('iptc-caption')])));
  if (opts.comment) parts.push(app(0xfe, te('secret comment')));
  if (opts.icc) parts.push(app(0xe2, concat([te('ICC_PROFILE\0'), Uint8Array.of(1, 1), new Uint8Array(128).fill(7)])));
  parts.push(base.subarray(2));
  return concat(parts);
}

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat([te(type), data]);
  return concat([be32(data.length), typed, be32(crc32(typed))]);
}

/** A small PNG (pngjs) with an optional text chunk, iTXt XMP, eXIf (GPS TIFF) and tIME injected before IEND. */
export function pngWithMetadata(opts: { text?: boolean; xmp?: boolean; exif?: boolean; time?: boolean } = {}): Uint8Array {
  const png = new Uint8Array(PNG.sync.write(new PNG({ width: 4, height: 4 })));
  const iend = png.length - 12;
  const extra: Uint8Array[] = [];
  if (opts.text) extra.push(pngChunk('tEXt', concat([te('Author'), Uint8Array.of(0), te('Jane Example')])));
  if (opts.xmp) extra.push(pngChunk('iTXt', concat([te('XML:com.adobe.xmp'), Uint8Array.of(0, 0, 0, 0, 0), te('<x:xmpmeta/>')])));
  if (opts.exif) extra.push(pngChunk('eXIf', GPS_TIFF()));
  if (opts.time) extra.push(pngChunk('tIME', Uint8Array.of(0x07, 0xe8, 1, 2, 3, 4, 5)));
  return concat([png.subarray(0, iend), ...extra, png.subarray(iend)]);
}

/** Hand-assembled WebP: VP8X (flags) + EXIF + XMP + the VP8L image chunk of the tiny lossless file. */
export function webpWithMetadata(flags: number, opts: { exif?: boolean; xmp?: boolean; icc?: boolean } = {}): Uint8Array {
  const image = b64(TINY_WEBP_B64).subarray(12);
  const chunk = (type: string, data: Uint8Array) => concat([te(type), le32(data.length), data, data.length & 1 ? Uint8Array.of(0) : new Uint8Array(0)]);
  const vp8x = new Uint8Array(10);
  vp8x[0] = flags;
  const parts: Uint8Array[] = [chunk('VP8X', vp8x)];
  if (opts.icc) parts.push(chunk('ICCP', new Uint8Array(32).fill(3)));
  parts.push(image);
  if (opts.exif) parts.push(chunk('EXIF', GPS_TIFF()));
  if (opts.xmp) parts.push(chunk('XMP ', te('<x:xmpmeta/>')));
  const body = concat([te('WEBP'), ...parts]);
  return concat([te('RIFF'), le32(body.length), body]);
}

