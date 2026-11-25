import { ToolError } from '@/lib/errors';
import type { Table } from './table';

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/**
 * JSON array of objects -> table. Headers are the keys in first-seen order; a missing key is an empty cell.
 * Nested objects and arrays are kept as their JSON text. Numbers are written as JavaScript prints them.
 */
export function parseJsonTable(text: string): Table {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ToolError('json', 'This file is not valid JSON.', 'Check the file for a missing comma or bracket, or import it as CSV.');
  }
  if (!Array.isArray(data)) throw new ToolError('json', 'The JSON must be an array of objects, like [{"name": "Ana"}].', 'Export the data as one array of objects.');
  const items: unknown[] = data;
  const headers: string[] = [];
  const index = new Map<string, number>();
  items.forEach((item, n) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ToolError('json', `Item ${n + 1} is not an object.`, 'Every item in the array must look like {"key": "value"}.');
    }
    for (const k of Object.keys(item)) {
      if (!index.has(k)) {
        index.set(k, headers.length);
        headers.push(k);
      }
    }
  });
  const rows = items.map((item) => {
    const row = Array<string>(headers.length).fill('');
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) row[index.get(k) ?? 0] = cellText(v);
    return row;
  });
  return { headers, rows };
}
