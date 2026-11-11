import { ToolError } from '@/lib/errors';
import type { Table } from './table';

/** null = every column. Otherwise the selected column indexes. */
export type Scope = number[] | null;
export type Summary = { changedCells: number; removedRows: number; note?: string };
export type Effect = { table: Table; summary: Summary };

const inScope = (scope: Scope, i: number) => scope === null || scope.includes(i);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Map selected cells. Unchanged rows keep their reference, so history stays cheap. */
function mapCells(t: Table, scope: Scope, fn: (v: string) => string): Effect {
  let changedCells = 0;
  const rows = t.rows.map((r) => {
    let touched = false;
    const out = r.map((v, i) => {
      if (!inScope(scope, i)) return v;
      const nv = fn(v);
      if (nv !== v) {
        changedCells++;
        touched = true;
      }
      return nv;
    });
    return touched ? out : r;
  });
  return { table: { headers: t.headers, rows }, summary: { changedCells, removedRows: 0 } };
}

export function trimCells(t: Table, scope: Scope): Effect {
  return mapCells(t, scope, (v) => v.trim());
}

export function removeEmptyRows(t: Table): Effect {
  const rows = t.rows.filter((r) => r.some((c) => c.trim() !== ''));
  return { table: { headers: t.headers, rows }, summary: { changedCells: 0, removedRows: t.rows.length - rows.length } };
}

/** Keep the first row for each key. exact: values as-is. normalized: trim, ignore case, collapse spaces. */
export function dedupe(t: Table, scope: Scope, mode: 'exact' | 'normalized'): Effect {
  if (scope?.length === 0) throw new ToolError('scope', 'Select at least one column for duplicate detection.', 'Tick one or more columns.');
  const seen = new Set<string>();
  const rows = t.rows.filter((r) => {
    const key = JSON.stringify(r.filter((_, i) => inScope(scope, i)).map((v) => (mode === 'normalized' ? norm(v) : v)));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { table: { headers: t.headers, rows }, summary: { changedCells: 0, removedRows: t.rows.length - rows.length } };
}

export function renameColumn(t: Table, i: number, name: string): Effect {
  const headers = t.headers.map((h, j) => (j === i ? name : h));
  return { table: { headers, rows: t.rows }, summary: { changedCells: 0, removedRows: 0, note: `Column ${i + 1} renamed` } };
}

export function moveColumn(t: Table, from: number, to: number): Effect {
  if (to < 0 || to >= t.headers.length) throw new ToolError('range', 'That column cannot move any further in that direction.', 'Choose another column or direction.');
  const move = <T,>(a: T[]) => {
    const b = [...a];
    const [x] = b.splice(from, 1);
    if (x !== undefined) b.splice(to, 0, x);
    return b;
  };
  return { table: { headers: move(t.headers), rows: t.rows.map((r) => move(r)) }, summary: { changedCells: 0, removedRows: 0 } };
}

export function deleteColumn(t: Table, i: number): Effect {
  const keep = (a: string[]) => a.filter((_, j) => j !== i);
  const values = t.rows.filter((r) => (r[i] ?? '') !== '').length;
  return { table: { headers: keep(t.headers), rows: t.rows.map(keep) }, summary: { changedCells: 0, removedRows: 0, note: `${values} non-empty values removed` } };
}

/** Replace column i with `parts` new columns. Pieces past the last column stay joined in the last one. */
export function splitColumn(t: Table, i: number, sep: string, parts: number): Effect {
  if (sep === '') throw new ToolError('split', 'The separator cannot be empty.', 'Enter the character or text that separates the parts.');
  if (parts < 2 || parts > 10) throw new ToolError('split', 'Split into 2 to 10 columns.', 'Choose a number of columns between 2 and 10.');
  const base = (t.headers[i] ?? '').trim() === '' ? `Column ${i + 1}` : (t.headers[i] ?? '');
  let split = 0;
  let overflow = 0;
  const cut = (v: string): string[] => {
    if (!v.includes(sep)) return [v, ...Array<string>(parts - 1).fill('')];
    split++;
    const pieces = v.split(sep);
    if (pieces.length > parts) overflow++;
    const head = pieces.slice(0, parts - 1);
    return [...head, pieces.slice(parts - 1).join(sep)];
  };
  const headers = [...t.headers.slice(0, i), ...Array.from({ length: parts }, (_, k) => `${base} ${k + 1}`), ...t.headers.slice(i + 1)];
  const rows = t.rows.map((r) => [...r.slice(0, i), ...cut(r[i] ?? ''), ...r.slice(i + 1)]);
  const note = overflow ? `${overflow} cells had more parts than columns; the rest stayed in column ${parts}` : undefined;
  return { table: { headers, rows }, summary: { changedCells: split, removedRows: 0, note } };
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type ReplaceOptions = { find: string; replace: string; regex: boolean; matchCase: boolean; scope: Scope };

export function findReplace(t: Table, o: ReplaceOptions): Effect {
  if (o.find === '') return { table: t, summary: { changedCells: 0, removedRows: 0 } };
  let re: RegExp;
  try {
    re = new RegExp(o.regex ? o.find : escapeRegExp(o.find), o.matchCase ? 'g' : 'gi');
  } catch (e) {
    const why = e instanceof Error ? e.message : 'unknown error';
    throw new ToolError('regex', `Invalid regular expression: ${why}`, 'Fix the pattern, or turn off regex mode to match the text literally.');
  }
  // Replacement text is literal in plain mode, and $1-style groups only in regex mode.
  const repl = o.regex ? o.replace : o.replace.replace(/\$/g, '$$$$');
  return mapCells(t, o.scope, (v) => v.replace(re, repl));
}
