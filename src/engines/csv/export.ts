import Papa from 'papaparse';
import { ToolError } from '@/lib/errors';
import { baseHeaders, displayHeaders, type Table } from './table';

export type ExportFormat = 'csv' | 'tsv' | 'json';
export type ExportOptions = {
  format: ExportFormat;
  delimiter: ',' | ';' | '\t' | '|';
  eol: 'LF' | 'CRLF';
  bom: boolean;
  quoteAll: boolean;
  /** Explicit policy, off by default. Prefixes risky cells with an apostrophe. */
  formulaSafe: boolean;
  includeHeader: boolean;
};

export type ExportResult = {
  text: string;
  mime: string;
  ext: string;
  rows: number;
  /** Cells that the formula-safe policy changes (0 when the policy is off). */
  formulaCells: number;
  /** JSON only: headers renamed so every key is unique. */
  renamedHeaders: number;
  /** Rows read back from the generated text. Equal to rows when verified. */
  verifiedRows: number;
};

const FORMULA = /^[=+\-@\t\r]/;

/** Number of cells the formula-safe policy would change (headers included when they are exported). */
export function formulaCellCount(t: Table, includeHeader: boolean): number {
  const count = (r: string[]) => r.reduce((n, v) => (FORMULA.test(v) ? n + 1 : n), 0);
  return t.rows.reduce((n, r) => n + count(r), includeHeader ? count(t.headers) : 0);
}

const guard = (v: string) => (FORMULA.test(v) ? `'${v}` : v);

function quoteField(v: string, delim: string, quoteAll: boolean, single: boolean): string {
  const needs = quoteAll || v.includes(delim) || v.includes('"') || /[\r\n]/.test(v) || (single && v === '');
  return needs ? `"${v.replace(/"/g, '""')}"` : v;
}

/** RFC 4180 style: every line ends with the chosen line ending, quotes are doubled. */
function delimited(rows: string[][], o: ExportOptions, eol: string): string {
  const single = (rows[0]?.length ?? 0) === 1;
  let out = '';
  for (const r of rows) out += r.map((v) => quoteField(v, o.delimiter, o.quoteAll, single)).join(o.delimiter) + eol;
  return out;
}

export function exportTable(t: Table, o: ExportOptions): ExportResult {
  const formulaCells = o.formulaSafe && o.format !== 'json' ? formulaCellCount(t, o.includeHeader) : 0;
  if (o.format === 'json') {
    const keys = displayHeaders(t.headers);
    const renamedHeaders = keys.filter((k, i) => k !== baseHeaders(t.headers)[i]).length;
    const objects = t.rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
    const text = JSON.stringify(objects, null, 2) + '\n';
    const verified = (JSON.parse(text) as unknown[]).length;
    if (verified !== t.rows.length) throw mismatch(t.rows.length, verified);
    return { text, mime: 'application/json', ext: 'json', rows: t.rows.length, formulaCells: 0, renamedHeaders, verifiedRows: verified };
  }

  const eol = o.eol === 'CRLF' ? '\r\n' : '\n';
  const body = t.rows.map((r) => (o.formulaSafe ? r.map(guard) : r));
  const head = o.includeHeader ? [o.formulaSafe ? t.headers.map(guard) : t.headers] : [];
  const rows = [...head, ...body];
  const text = (o.bom ? '﻿' : '') + delimited(rows, o, eol);

  // Read back with an independent parser (papaparse) and compare every cell with what was written.
  const verifiedRows = verifyDelimited(text, rows, o.delimiter, eol);
  const expected = t.rows.length;
  const shownRows = verifiedRows - (o.includeHeader ? 1 : 0);
  if (shownRows !== expected) throw mismatch(expected, shownRows);
  return {
    text,
    mime: o.format === 'tsv' ? 'text/tab-separated-values' : 'text/csv',
    ext: o.format === 'tsv' ? 'tsv' : 'csv',
    rows: expected,
    formulaCells,
    renamedHeaders: 0,
    verifiedRows: shownRows,
  };
}

function verifyDelimited(text: string, expected: string[][], delim: string, eol: '\n' | '\r\n'): number {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (body === '') return 0;
  const data = Papa.parse<string[]>(body, { delimiter: delim, newline: eol, skipEmptyLines: false, quoteChar: '"', worker: false }).data;
  // Every generated line ends with eol, so Papa always adds one empty artifact row at the end.
  if (body.endsWith(eol)) data.pop();
  if (data.length !== expected.length) throw new ToolError('verify', `Verification failed: wrote ${expected.length} rows, read back ${data.length}.`, 'Export again, or export as JSON, which is checked separately.');
  for (let i = 0; i < expected.length; i++) {
    const a = expected[i] ?? [];
    const b = data[i] ?? [];
    if (a.length !== b.length || a.some((v, j) => v !== b[j]))
      throw new ToolError('verify', `Verification failed at row ${i + 1}: the text read back differs from the table.`, 'Export again, or turn off the formula-safe option and compare.');
  }
  return data.length;
}

function mismatch(expected: number, got: number): ToolError {
  return new ToolError('verify', `Verification failed: table has ${expected} rows, export reads back ${got}.`, 'Nothing was exported. Try again.');
}
