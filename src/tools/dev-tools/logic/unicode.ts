export type CodePointRow = { char: string; cp: number; name: string; utf8: number[]; utf16Units: number[] };

/** Names for common invisibles and controls only. Other code points show no name. */
const NAMES: Record<number, string> = {
  0x00: 'NULL',
  0x09: 'CHARACTER TABULATION (TAB)',
  0x0a: 'LINE FEED (LF)',
  0x0b: 'LINE TABULATION',
  0x0c: 'FORM FEED (FF)',
  0x0d: 'CARRIAGE RETURN (CR)',
  0x1b: 'ESCAPE',
  0x20: 'SPACE',
  0x7f: 'DELETE',
  0xa0: 'NO-BREAK SPACE',
  0xad: 'SOFT HYPHEN',
  0x2002: 'EN SPACE',
  0x2003: 'EM SPACE',
  0x2009: 'THIN SPACE',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x2028: 'LINE SEPARATOR',
  0x2029: 'PARAGRAPH SEPARATOR',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x2060: 'WORD JOINER',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)',
  0xfffd: 'REPLACEMENT CHARACTER',
};

export function codePointRows(text: string): CodePointRow[] {
  const enc = new TextEncoder();
  const rows: CodePointRow[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const name = NAMES[cp] ?? (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) ? 'CONTROL CHARACTER' : '(name not in built-in table)');
    const utf16Units = Array.from(ch, (_, i) => ch.charCodeAt(i));
    rows.push({ char: ch, cp, name, utf8: Array.from(enc.encode(ch)), utf16Units });
  }
  return rows;
}

const hex = (n: number, min: number) => n.toString(16).toUpperCase().padStart(min, '0');

/** Escapes as \uXXXX (astral code points become surrogate pairs) or \u{X}. */
export function toEscapes(text: string, style: 'u4' | 'brace', scope: 'non-ascii' | 'all'): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (scope === 'non-ascii' && cp < 0x80 && cp >= 0x20 && cp !== 0x7f) {
      out += ch;
    } else if (style === 'brace') {
      out += `\\u{${hex(cp, 1)}}`;
    } else if (cp > 0xffff) {
      const v = cp - 0x10000;
      out += `\\u${hex(0xd800 + (v >> 10), 4)}\\u${hex(0xdc00 + (v & 0x3ff), 4)}`;
    } else {
      out += `\\u${hex(cp, 4)}`;
    }
  }
  return out;
}

export type UnescapeResult = { ok: true; value: string } | { ok: false; error: string };

export function fromEscapes(input: string): UnescapeResult {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== '\\') {
      out += input[i];
      continue;
    }
    if (input[i + 1] !== 'u') return { ok: false, error: `Unsupported escape at position ${i + 1}. Only \\uXXXX and \\u{X} are read.` };
    let cp: number;
    if (input[i + 2] === '{') {
      const close = input.indexOf('}', i + 3);
      const h = close === -1 ? '' : input.slice(i + 3, close);
      cp = /^[0-9a-fA-F]{1,6}$/.test(h) ? parseInt(h, 16) : -1;
      if (cp < 0 || cp > 0x10ffff) return { ok: false, error: `Invalid \\u{...} escape at position ${i + 1}.` };
      out += String.fromCodePoint(cp);
      i = close;
      continue;
    }
    const h = input.slice(i + 2, i + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(h)) return { ok: false, error: `Incomplete \\u escape at position ${i + 1}. Use four hex digits.` };
    cp = parseInt(h, 16);
    i += 5;
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const lo = input.slice(i + 1, i + 7);
      const m = /^\\u([dD][c-fC-F][0-9a-fA-F]{2})$/.exec(lo);
      if (!m) return { ok: false, error: `Lone high surrogate \\u${h.toUpperCase()} at position ${i - 4}. Pair it with a low surrogate.` };
      out += String.fromCharCode(cp, parseInt(m[1]!, 16));
      i += 6;
      continue;
    }
    if (cp >= 0xdc00 && cp <= 0xdfff) return { ok: false, error: `Lone low surrogate \\u${h.toUpperCase()} at position ${i - 4}.` };
    out += String.fromCharCode(cp);
  }
  return { ok: true, value: out };
}
