export type HexSep = 'space' | 'none' | '0x';
export type HexResult = { ok: true; text: string; bytes: number } | { ok: false; error: string };

export function textToHex(text: string, sep: HexSep): string {
  const bytes = Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0'));
  if (sep === 'none') return bytes.join('');
  if (sep === '0x') return bytes.map((b) => `0x${b}`).join(' ');
  return bytes.join(' ');
}

/** Accepts spaces, commas, and optional 0x prefixes. Errors point at the input position. */
export function hexToText(input: string): HexResult {
  const digits: { c: string; pos: number }[] = [];
  for (const m of input.matchAll(/\S+/g)) {
    let tok = m[0];
    let start = m.index ?? 0;
    if (/^0x/i.test(tok)) {
      tok = tok.slice(2);
      start += 2;
    }
    for (let i = 0; i < tok.length; i++) {
      const c = tok[i]!;
      if (c === ',') continue;
      if (!/[0-9a-fA-F]/.test(c)) return { ok: false, error: `Invalid hex character "${c}" at position ${start + i + 1}.` };
      digits.push({ c, pos: start + i + 1 });
    }
  }
  if (digits.length === 0) return { ok: false, error: 'Enter hex bytes, such as 48 65 6c 6c 6f.' };
  if (digits.length % 2 !== 0) return { ok: false, error: `Odd number of hex digits (${digits.length}). Each byte needs exactly two digits.` };
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(digits[2 * i]!.c + digits[2 * i + 1]!.c, 16);
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes: bytes.length };
  } catch {
    return { ok: false, error: 'These bytes are not valid UTF-8 text.' };
  }
}
