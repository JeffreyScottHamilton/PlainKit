import Papa from 'papaparse';

export type Delim = ',' | ';' | '\t';
export type CsvResult = { ok: true; output: string; rows: number } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** JSON array of objects to CSV. Header is the union of keys in first-seen order. */
export function jsonToCsv(text: string, delimiter: Delim): CsvResult {
  if (!text.trim()) return { ok: false, error: 'Paste a JSON array of objects.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}` };
  }
  if (!Array.isArray(data)) return { ok: false, error: 'The top level must be an array, such as [{"a":1}].' };
  if (data.length === 0) return { ok: false, error: 'The array is empty. Add at least one object.' };
  const fields: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < data.length; i++) {
    const row: unknown = data[i];
    if (!isObj(row)) return { ok: false, error: `Item ${i + 1} is not an object. Every item must be an object like {"a":1}.` };
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        fields.push(k);
      }
    }
  }
  const rows = (data as Record<string, unknown>[]).map((r) => fields.map((f) => cell(r[f])));
  const output = Papa.unparse({ fields, data: rows }, { delimiter, newline: '\r\n' });
  return { ok: true, output, rows: rows.length };
}

/** CSV with a header row to a JSON array of objects. Values stay strings. */
export function csvToJson(text: string, delimiter: Delim): CsvResult {
  const src = text.replace(/^﻿/, '');
  if (!src.trim()) return { ok: false, error: 'Paste CSV with a header row.' };
  const parsed = Papa.parse<Record<string, string>>(src, { header: true, delimiter, skipEmptyLines: 'greedy' });
  const first = parsed.errors[0];
  if (first) return { ok: false, error: `Row ${(first.row ?? 0) + 1}: ${first.message}` };
  const fields = parsed.meta.fields ?? [];
  if (fields.some((f) => f === '')) return { ok: false, error: 'The header row has an empty column name.' };
  const dup = fields.find((f, i) => fields.indexOf(f) !== i);
  if (dup !== undefined) return { ok: false, error: `Duplicate column name "${dup}" in the header row.` };
  if (parsed.data.length === 0) return { ok: false, error: 'No data rows found under the header.' };
  return { ok: true, output: JSON.stringify(parsed.data, null, 2), rows: parsed.data.length };
}
