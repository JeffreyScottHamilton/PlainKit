// Reads PDF bytes into objects. This is a custom reader because pdf-lib parses object streams eagerly,
// which fails on encrypted files. Object headers are found by scanning, so broken or missing
// xref tables do not matter. Later definitions win, which handles incremental updates.

import { unzlibSync, inflateSync } from 'fflate';
import { dict, isDict, isName, name, str, type PdfDict, type PdfValue } from './types';

export type RawObject = { readonly num: number; readonly gen: number; readonly offset: number; readonly value: PdfValue };
export type RawPdf = { readonly bytes: Uint8Array; readonly objects: Map<number, RawObject>; readonly trailer: PdfDict };

export class PdfSyntaxError extends Error {}

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isWs = (c: number) => WS.has(c);
const isRegular = (c: number) => !WS.has(c) && !DELIM.has(c);
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const hexVal = (c: number) => (c >= 0x30 && c <= 0x39 ? c - 0x30 : (c | 0x20) >= 0x61 && (c | 0x20) <= 0x66 ? (c | 0x20) - 0x57 : -1);

export class Lexer {
  pos: number;
  constructor(
    readonly b: Uint8Array,
    pos = 0,
  ) {
    this.pos = pos;
  }

  skipWs(): void {
    const b = this.b;
    while (this.pos < b.length) {
      const c = b[this.pos]!;
      if (isWs(c)) this.pos++;
      else if (c === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 0x0a && b[this.pos] !== 0x0d) this.pos++;
      } else break;
    }
  }

  /** Reads a run of regular characters (keywords and numbers). Empty string at a delimiter. */
  token(): string {
    const start = this.pos;
    while (this.pos < this.b.length && isRegular(this.b[this.pos]!)) this.pos++;
    return String.fromCharCode(...this.b.subarray(start, this.pos));
  }

  peekToken(): string {
    const save = this.pos;
    this.skipWs();
    const t = this.token();
    this.pos = save;
    return t;
  }

  value(depth = 0): PdfValue {
    if (depth > 200) throw new PdfSyntaxError('nesting too deep');
    this.skipWs();
    if (this.pos >= this.b.length) throw new PdfSyntaxError('unexpected end of file');
    const c = this.b[this.pos]!;
    if (c === 0x2f) return this.nameValue();
    if (c === 0x28) return this.literalString();
    if (c === 0x3c) {
      if (this.b[this.pos + 1] === 0x3c) return this.dictValue(depth);
      return this.hexString();
    }
    if (c === 0x5b) return this.arrayValue(depth);
    if (c === 0x29 || c === 0x3e || c === 0x5d || c === 0x7b || c === 0x7d) throw new PdfSyntaxError('unexpected delimiter');

    const t = this.token();
    if (t === '') throw new PdfSyntaxError('empty token');
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null') return null;
    if (NUM_RE.test(t)) {
      const n = Number(t);
      if (!Number.isFinite(n)) throw new PdfSyntaxError('bad number');
      // "int int R" is an indirect reference.
      if (/^\d+$/.test(t)) {
        const save = this.pos;
        this.skipWs();
        const g = this.token();
        if (/^\d+$/.test(g)) {
          this.skipWs();
          if (this.token() === 'R') return { kind: 'ref', num: Number(t) };
        }
        this.pos = save;
      }
      return n;
    }
    throw new PdfSyntaxError(`unexpected keyword ${t}`);
  }

  private nameValue(): PdfValue {
    this.pos++;
    const start = this.pos;
    while (this.pos < this.b.length && isRegular(this.b[this.pos]!)) this.pos++;
    const raw = this.b.subarray(start, this.pos);
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i]!;
      if (c === 0x23 && i + 2 < raw.length && hexVal(raw[i + 1]!) >= 0 && hexVal(raw[i + 2]!) >= 0) {
        out += String.fromCharCode(hexVal(raw[i + 1]!) * 16 + hexVal(raw[i + 2]!));
        i += 2;
      } else out += String.fromCharCode(c);
    }
    return name(out);
  }

  private literalString(): PdfValue {
    const b = this.b;
    this.pos++;
    const out: number[] = [];
    let depth = 1;
    while (true) {
      if (this.pos >= b.length) throw new PdfSyntaxError('unterminated string');
      const c = b[this.pos++]!;
      if (c === 0x5c) {
        const e = b[this.pos++];
        if (e === undefined) throw new PdfSyntaxError('unterminated string');
        if (e >= 0x30 && e <= 0x37) {
          let v = e - 0x30;
          for (let k = 0; k < 2 && b[this.pos]! >= 0x30 && b[this.pos]! <= 0x37; k++) v = v * 8 + (b[this.pos++]! - 0x30);
          out.push(v & 255);
        } else if (e === 0x6e) out.push(0x0a);
        else if (e === 0x72) out.push(0x0d);
        else if (e === 0x74) out.push(0x09);
        else if (e === 0x62) out.push(0x08);
        else if (e === 0x66) out.push(0x0c);
        else if (e === 0x0d) {
          if (b[this.pos] === 0x0a) this.pos++;
        } else if (e !== 0x0a) out.push(e);
      } else if (c === 0x28) {
        depth++;
        out.push(c);
      } else if (c === 0x29) {
        depth--;
        if (depth === 0) break;
        out.push(c);
      } else out.push(c);
    }
    return str(Uint8Array.from(out));
  }

  private hexString(): PdfValue {
    this.pos++;
    const out: number[] = [];
    let hi = -1;
    while (true) {
      if (this.pos >= this.b.length) throw new PdfSyntaxError('unterminated hex string');
      const c = this.b[this.pos++]!;
      if (c === 0x3e) break;
      if (isWs(c)) continue;
      const v = hexVal(c);
      if (v < 0) throw new PdfSyntaxError('bad hex digit');
      if (hi < 0) hi = v;
      else {
        out.push(hi * 16 + v);
        hi = -1;
      }
    }
    if (hi >= 0) out.push(hi * 16);
    return str(Uint8Array.from(out));
  }

  private dictValue(depth: number): PdfDict {
    this.pos += 2;
    const map = new Map<string, PdfValue>();
    while (true) {
      this.skipWs();
      if (this.b[this.pos] === 0x3e && this.b[this.pos + 1] === 0x3e) {
        this.pos += 2;
        break;
      }
      const key = this.value(depth + 1);
      if (!isName(key)) throw new PdfSyntaxError('dictionary key is not a name');
      map.set(key.name, this.value(depth + 1));
    }
    return dict([...map]);
  }

  private arrayValue(depth: number): PdfValue[] {
    this.pos++;
    const out: PdfValue[] = [];
    while (true) {
      this.skipWs();
      if (this.pos >= this.b.length) throw new PdfSyntaxError('unterminated array');
      if (this.b[this.pos] === 0x5d) {
        this.pos++;
        break;
      }
      out.push(this.value(depth + 1));
    }
    return out;
  }
}

/** Returns index of the next "obj" keyword at or after from that ends a token, or -1. */
function findObjKeyword(b: Uint8Array, from: number): number {
  for (let i = from; i + 2 < b.length; i++) {
    if (b[i] === 0x6f && b[i + 1] === 0x62 && b[i + 2] === 0x6a && (i + 3 >= b.length || !isRegular(b[i + 3]!)) && (i === 0 || !isRegular(b[i - 1]!) || isWs(b[i - 1]!))) return i;
  }
  return -1;
}

/** Reads "num gen" just before the obj keyword. Returns null if the header is malformed. */
function headerBefore(b: Uint8Array, objAt: number): { num: number; gen: number; start: number } | null {
  let i = objAt - 1;
  while (i >= 0 && isWs(b[i]!)) i--;
  const genEnd = i + 1;
  while (i >= 0 && b[i]! >= 0x30 && b[i]! <= 0x39) i--;
  const genStart = i + 1;
  if (genStart === genEnd || i < 0 || !isWs(b[i]!)) return null;
  while (i >= 0 && isWs(b[i]!)) i--;
  const numEnd = i + 1;
  while (i >= 0 && b[i]! >= 0x30 && b[i]! <= 0x39) i--;
  const numStart = i + 1;
  if (numStart === numEnd) return null;
  if (i >= 0 && isRegular(b[i]!)) return null;
  const text = (s: number, e: number) => Number(String.fromCharCode(...b.subarray(s, e)));
  return { num: text(numStart, numEnd), gen: text(genStart, genEnd), start: numStart };
}

function streamBody(lex: Lexer, dict: PdfDict): Uint8Array {
  const b = lex.b;
  let p = lex.pos;
  if (b[p] === 0x0d && b[p + 1] === 0x0a) p += 2;
  else if (b[p] === 0x0a || b[p] === 0x0d) p += 1;
  else throw new PdfSyntaxError('stream keyword not followed by EOL');
  const len = dict.map.get('Length');
  if (typeof len === 'number' && Number.isInteger(len) && len >= 0 && p + len <= b.length) {
    let q = p + len;
    while (q < b.length && isWs(b[q]!)) q++;
    if (matchAt(b, q, 'endstream')) {
      lex.pos = q + 9;
      return b.subarray(p, p + len);
    }
  }
  const idx = indexOfBytes(b, 'endstream', p);
  if (idx < 0) throw new PdfSyntaxError('missing endstream');
  let end = idx;
  if (end > p && b[end - 1] === 0x0a) end--;
  if (end > p && b[end - 1] === 0x0d) end--;
  lex.pos = idx + 9;
  return b.subarray(p, end);
}

function matchAt(b: Uint8Array, at: number, s: string): boolean {
  if (at + s.length > b.length) return false;
  for (let k = 0; k < s.length; k++) if (b[at + k] !== s.charCodeAt(k)) return false;
  return true;
}

function indexOfBytes(b: Uint8Array, s: string, from: number): number {
  for (let i = from; i <= b.length - s.length; i++) if (matchAt(b, i, s)) return i;
  return -1;
}

/** Parses one "num gen obj ... endobj" at the header start. Returns the object and end position. */
function parseIndirect(b: Uint8Array, start: number): { obj: RawObject; end: number } {
  const lex = new Lexer(b, start);
  const word = (): string => {
    lex.skipWs();
    return lex.token();
  };
  const num = Number(word());
  const gen = Number(word());
  if (word() !== 'obj') throw new PdfSyntaxError('expected obj');
  let value = lex.value();
  lex.skipWs();
  if (isDict(value) && matchAt(b, lex.pos, 'stream')) {
    lex.pos += 6;
    const data = streamBody(lex, value);
    value = { kind: 'stream', dict: value, data };
  }
  return { obj: { num, gen, offset: start, value }, end: lex.pos };
}

/** Scans the whole file for indirect objects, in file order (later definitions replace earlier). */
export function scanPdf(bytes: Uint8Array): RawPdf {
  const objects = new Map<number, RawObject>();
  let from = 0;
  while (true) {
    const at = findObjKeyword(bytes, from);
    if (at < 0) break;
    const h = headerBefore(bytes, at);
    if (!h) {
      from = at + 3;
      continue;
    }
    try {
      const { obj, end } = parseIndirect(bytes, h.start);
      objects.set(obj.num, obj);
      from = end;
    } catch {
      from = at + 3;
    }
  }
  return { bytes, objects, trailer: findTrailer(bytes, objects) };
}

/** Trailer candidates: "trailer" dictionaries and XRef stream dictionaries. The last one with /Root wins. */
function findTrailer(b: Uint8Array, objects: Map<number, RawObject>): PdfDict {
  let best: { at: number; d: PdfDict } | null = null;
  for (let i = indexOfBytes(b, 'trailer', 0); i >= 0; i = indexOfBytes(b, 'trailer', i + 7)) {
    try {
      const lex = new Lexer(b, i + 7);
      const d = lex.value();
      if (isDict(d) && d.map.has('Root') && (!best || i > best.at)) best = { at: i, d };
    } catch {
      /* not a trailer */
    }
  }
  for (const o of objects.values()) {
    if (o.value && typeof o.value === 'object' && !Array.isArray(o.value) && o.value.kind === 'stream' && isName(o.value.dict.map.get('Type'), 'XRef')) {
      const d = o.value.dict;
      if (d.map.has('Root') && (!best || o.offset > best.at)) best = { at: o.offset, d };
    }
  }
  if (!best) throw new PdfSyntaxError('no trailer with /Root found');
  return best.d;
}

export function inflate(data: Uint8Array): Uint8Array {
  try {
    return unzlibSync(data);
  } catch {
    return inflateSync(data);
  }
}

/**
 * Object streams: returns members as direct objects. A member replaces a direct object with the
 * same number only if the container sits later in the file.
 * decode is called on each object stream before its members are read (decryption happens there).
 */
export function expandObjectStreams(
  objects: Map<number, RawObject>,
  decode: (o: RawObject) => RawObject,
): Map<number, RawObject> {
  const out = new Map<number, RawObject>();
  const containers: RawObject[] = [];
  for (const o of objects.values()) {
    const v = o.value;
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'stream' && isName(v.dict.map.get('Type'), 'ObjStm')) containers.push(o);
    else out.set(o.num, o);
  }
  for (const c of containers) {
    const decoded = decode(c);
    const dv = decoded.value;
    if (typeof dv !== 'object' || dv === null || Array.isArray(dv) || dv.kind !== 'stream') throw new PdfSyntaxError('object stream is not a stream');
    const { dict: d, data } = dv;
    const n = d.map.get('N');
    const first = d.map.get('First');
    if (typeof n !== 'number' || typeof first !== 'number') throw new PdfSyntaxError('bad object stream header');
    const body = inflate(data);
    const head = new Lexer(body);
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const num = Number(head.token());
      head.skipWs();
      const off = Number(head.token());
      pairs.push([num, off]);
      head.skipWs();
    }
    for (const [num, off] of pairs) {
      const existing = out.get(num);
      if (existing && existing.offset > c.offset) continue;
      const lex = new Lexer(body, first + off);
      const value = lex.value();
      out.set(num, { num, gen: 0, offset: c.offset, value });
    }
  }
  return out;
}
