export type EscapeMode = 'json' | 'js' | 'regex';
export type EscapeResult = { ok: true; value: string } | { ok: false; error: string };

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');

export function escapeText(mode: EscapeMode, s: string): string {
  if (mode === 'json') return JSON.stringify(s).slice(1, -1);
  if (mode === 'regex') return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (ch === '\\') out += '\\\\';
    else if (ch === "'") out += "\\'";
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029) out += c <= 0xff ? `\\x${hex2(c)}` : `\\u${hex4(c)}`;
    else out += ch;
  }
  return out;
}

const SIMPLE_JS: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', '\\': '\\', "'": "'", '"': '"' };

export function unescapeText(mode: EscapeMode, s: string): EscapeResult {
  if (mode === 'json') {
    try {
      // The quotes wrap the whole input, so unescaped quotes inside it fail to parse.
      const v: unknown = JSON.parse(`"${s}"`);
      return typeof v === 'string' ? { ok: true, value: v } : { ok: false, error: 'Not a valid JSON string body.' };
    } catch {
      return { ok: false, error: 'Malformed JSON escape. Check for unescaped quotes, raw line breaks, or an incomplete \\uXXXX.' };
    }
  }
  if (mode === 'regex') {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!;
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      const next = s[i + 1];
      if (next === undefined) return { ok: false, error: `Trailing backslash at position ${i + 1}. Add a character after it.` };
      if (/[A-Za-z0-9]/.test(next)) return { ok: false, error: `\\${next} at position ${i + 1} is a regex class or escape, not an escaped literal.` };
      out += next;
      i++;
    }
    return { ok: true, value: out };
  }
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const e = s[i + 1];
    if (e === undefined) return { ok: false, error: `Trailing backslash at position ${i + 1}.` };
    if (e === 'x') {
      const h = s.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) return { ok: false, error: `Incomplete \\x escape at position ${i + 1}. Use two hex digits.` };
      out += String.fromCharCode(parseInt(h, 16));
      i += 3;
    } else if (e === 'u') {
      if (s[i + 2] === '{') {
        const close = s.indexOf('}', i + 3);
        const h = close === -1 ? '' : s.slice(i + 3, close);
        const cp = /^[0-9a-fA-F]{1,6}$/.test(h) ? parseInt(h, 16) : -1;
        if (cp < 0 || cp > 0x10ffff) return { ok: false, error: `Invalid \\u{...} escape at position ${i + 1}.` };
        out += String.fromCodePoint(cp);
        i = close;
      } else {
        const h = s.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) return { ok: false, error: `Incomplete \\u escape at position ${i + 1}. Use four hex digits.` };
        out += String.fromCharCode(parseInt(h, 16));
        i += 5;
      }
    } else if (e in SIMPLE_JS) {
      out += SIMPLE_JS[e];
      i++;
    } else if (/[A-Za-z0-9]/.test(e)) {
      return { ok: false, error: `Unknown escape \\${e} at position ${i + 1}.` };
    } else {
      out += e;
      i++;
    }
  }
  return { ok: true, value: out };
}
