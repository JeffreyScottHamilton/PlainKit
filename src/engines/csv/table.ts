import Papa from 'papaparse';
import { ToolError } from '@/lib/errors';

export type Table = { headers: string[]; rows: string[][] };

export type ParseOptions = { delimiter: string | 'auto'; quote: string; header: boolean };
export type Parsed = {
  table: Table;
  delimiter: string;
  delimiterAuto: boolean;
  /** Data rows whose field count differs from the header (or first row when there is no header). Padded, not dropped. */
  raggedRows: number;
  parseErrors: string[];
};

function detectDelimiter(text: string): string {
  const head = text.slice(0, 65536).replace(/[\r\n]+$/, '');
  return Papa.parse(head, { delimiter: '', preview: 20, worker: false }).meta.delimiter ?? ',';
}

/** Parse text to a rectangular table. Ragged rows are padded with empty cells. */
export function parseCsv(text: string, opt: ParseOptions): Parsed {
  if (opt.quote.length !== 1) throw new ToolError('quote', 'The quote character must be exactly one character.', 'Use " (double quote) or another single character.');
  if (opt.delimiter !== 'auto' && opt.delimiter === opt.quote)
    throw new ToolError('quote', 'The quote character cannot also be the delimiter.', 'Choose a different quote character or delimiter.');
  // Detect on the first lines only. A trailing newline would add an inconsistent row and defeat the guess.
  const delimiter = opt.delimiter === 'auto' ? detectDelimiter(text) : opt.delimiter;
  const res = Papa.parse<string[]>(text, {
    delimiter,
    quoteChar: opt.quote,
    skipEmptyLines: false,
  });
  const rows = res.data;
  // Papa returns a final [""] for a trailing newline. That is not a data row.
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === '') rows.pop();

  let headers: string[] = [];
  if (opt.header) headers = rows.shift() ?? [];
  const expected = opt.header ? headers.length : (rows[0]?.length ?? 0);
  const raggedRows = rows.reduce((n, r) => (r.length === expected ? n : n + 1), 0);
  const width = Math.max(headers.length, expected, ...rows.map((r) => r.length), 0);
  const pad = (r: string[]) => (r.length === width ? r : [...r, ...Array<string>(width - r.length).fill('')]);
  return {
    table: { headers: pad(headers), rows: rows.map(pad) },
    delimiter: delimiter === '' ? ',' : delimiter,
    delimiterAuto: opt.delimiter === 'auto',
    raggedRows,
    parseErrors: res.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 1 + (opt.header ? 1 : 0)}: ${e.message}`),
  };
}

/** Header as written, with empty names shown as "Column N". */
export function baseHeaders(headers: string[]): string[] {
  return headers.map((h, i) => (h.trim() === '' ? `Column ${i + 1}` : h));
}

/** Display names only. Duplicates become "name (2)", never clashing with another name. The model keeps raw names. */
export function displayHeaders(headers: string[]): string[] {
  const base = baseHeaders(headers);
  const count = new Map<string, number>();
  base.forEach((b) => count.set(b, (count.get(b) ?? 0) + 1));
  const used = new Set(base.filter((b) => count.get(b) === 1));
  const seen = new Set<string>();
  return base.map((b) => {
    if (count.get(b) === 1) return b;
    if (!seen.has(b)) {
      seen.add(b);
      used.add(b);
      return b;
    }
    let k = 2;
    while (used.has(`${b} (${k})`)) k++;
    const name = `${b} (${k})`;
    used.add(name);
    return name;
  });
}
