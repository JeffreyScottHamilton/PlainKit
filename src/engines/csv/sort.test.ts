import { describe, expect, it } from 'vitest';
import { sortRows } from './ops';
import type { Table } from './table';

const t = (values: string[]): Table => ({ headers: ['v', 'id'], rows: values.map((v, i) => [v, String(i + 1)]) });
const col = (table: Table) => table.rows.map((r) => r[0]);

describe('sortRows', () => {
  it('sorts numbers by value, not as text', () => {
    expect(col(sortRows(t(['10', '2', '1.5', '-3']), 0, false).table)).toEqual(['-3', '1.5', '2', '10']);
  });

  it('sorts descending by value', () => {
    expect(col(sortRows(t(['10', '2', '1.5']), 0, true).table)).toEqual(['10', '2', '1.5']);
  });

  it('keeps empty cells last in both directions', () => {
    expect(col(sortRows(t(['', '5', '', '1']), 0, false).table)).toEqual(['1', '5', '', '']);
    expect(col(sortRows(t(['', '5', '', '1']), 0, true).table)).toEqual(['5', '1', '', '']);
  });

  it('sorts text naturally and case-insensitively, after numbers', () => {
    expect(col(sortRows(t(['file10', 'File2', 'apple', '7']), 0, false).table)).toEqual(['7', 'apple', 'File2', 'file10']);
  });

  it('keeps the original order for equal keys (stable)', () => {
    const r = sortRows(t(['1', '1.0', '1']), 0, false).table;
    expect(r.rows.map((x) => x[1])).toEqual(['1', '2', '3']);
  });

  it('does not change headers or row contents, and does not mutate the input', () => {
    const input = t(['3', '1']);
    const before = JSON.stringify(input);
    const out = sortRows(input, 0, false).table;
    expect(out.headers).toEqual(['v', 'id']);
    expect(out.rows.flat().sort()).toEqual(input.rows.flat().sort());
    expect(JSON.stringify(input)).toBe(before);
  });

  it('refuses a column that does not exist', () => {
    expect(() => sortRows(t(['1']), 5, false)).toThrow();
  });
});
