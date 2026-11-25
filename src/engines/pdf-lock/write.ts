// Serializes objects as a classic PDF file: header, objects, xref table, trailer. All output is ASCII
// (strings are hex, names are #-escaped), so offsets are plain byte counts.

import { isStream, type PdfDict, type PdfValue } from './types';

const enc = new TextEncoder();

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('non-finite number cannot be written');
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function formatName(n: string): string {
  let out = '/';
  for (const ch of enc.encode(n)) {
    const regular = ch > 0x20 && ch < 0x7f && !'()<>[]{}/%#'.includes(String.fromCharCode(ch));
    out += regular ? String.fromCharCode(ch) : `#${ch.toString(16).padStart(2, '0')}`;
  }
  return out;
}

function formatDict(d: PdfDict, override?: Record<string, PdfValue>): string {
  let out = '<<';
  for (const [k, v] of d.map) {
    if (override && k in override) continue;
    out += ` ${formatName(k)} ${formatValue(v)}`;
  }
  for (const [k, v] of Object.entries(override ?? {})) out += ` ${formatName(k)} ${formatValue(v)}`;
  return `${out} >>`;
}

export function formatValue(v: PdfValue): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return formatNumber(v);
  if (Array.isArray(v)) return `[${v.map(formatValue).join(' ')}]`;
  switch (v.kind) {
    case 'name':
      return formatName(v.name);
    case 'string':
      return `<${hex(v.bytes)}>`;
    case 'ref':
      return `${v.num} 0 R`;
    case 'dict':
      return formatDict(v);
    case 'stream':
      return formatDict(v.dict, { Length: v.data.length });
  }
}

/**
 * Writes objects with a classic xref table. trailerEntries must include /Root. /Size is added.
 * Object generation numbers are always 0; references are by number only.
 */
export function writePdf(objects: Map<number, PdfValue>, trailerEntries: PdfDict): Uint8Array {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  push('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
  const nums = [...objects.keys()].sort((a, b) => a - b);
  const maxNum = nums.length ? nums[nums.length - 1]! : 0;
  const offsets = new Map<number, number>();
  for (const num of nums) {
    const v = objects.get(num)!;
    offsets.set(num, length);
    push(`${num} 0 obj\n`);
    if (isStream(v)) {
      push(formatDict(v.dict, { Length: v.data.length }));
      push('\nstream\n');
      push(v.data);
      push('\nendstream');
    } else {
      push(formatValue(v));
    }
    push('\nendobj\n');
  }

  const xrefAt = length;
  const size = maxNum + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) {
    const off = offsets.get(n);
    xref += off === undefined ? '0000000000 65535 f \n' : `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n${formatDict(trailerEntries, { Size: size })}\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
