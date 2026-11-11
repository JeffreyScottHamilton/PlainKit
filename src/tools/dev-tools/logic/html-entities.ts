// Named entities supported by the decoder. Anything else is left as written and reported.
export const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', deg: '°',
  plusmn: '±', times: '×', divide: '÷', laquo: '«', raquo: '»',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ccedil: 'ç',
  ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', ntilde: 'ñ',
};

export function encodeEntities(text: string, nonAsciiNumeric: boolean): string {
  let out = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  if (nonAsciiNumeric) {
    out = Array.from(out, (ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp > 127 ? `&#${cp};` : ch;
    }).join('');
  }
  return out;
}

export type DecodeResult = { text: string; decoded: number; invalid: string[]; unknown: string[] };

export function decodeEntities(text: string): DecodeResult {
  let decoded = 0;
  const invalid: string[] = [];
  const unknown: string[] = [];
  const out = text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const cp = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        invalid.push(whole);
        return whole;
      }
      decoded++;
      return String.fromCodePoint(cp);
    }
    const v = NAMED[body];
    if (v === undefined) {
      unknown.push(whole);
      return whole;
    }
    decoded++;
    return v;
  });
  return { text: out, decoded, invalid, unknown };
}
