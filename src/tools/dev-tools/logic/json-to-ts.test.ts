import { describe, expect, it } from 'vitest';
import { jsonToTs } from './json-to-ts';

const SAMPLE = JSON.stringify({
  id: 1,
  user: { name: 'A', tags: ['x'] },
  items: [{ sku: 'a', price: 1 }, { sku: 'b', price: 2, note: 'n' }],
  mixed: [1, 'a', null],
  empty: [],
  'my-key': true,
  class: 'c',
});

describe('json-to-ts', () => {
  it('infers nested interfaces, unions, optional keys and quoted identifiers', () => {
    const r = jsonToTs(SAMPLE, 'Root');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.text;
    expect(t).toContain('export interface Root {');
    expect(t).toContain('  id: number;');
    expect(t).toContain('  user: User;');
    expect(t).toContain('export interface User {\n  name: string;\n  tags: string[];\n}');
    expect(t).toContain('  items: Item[];');
    expect(t).toContain('  sku: string;');
    expect(t).toContain('  note?: string;');
    expect(t).toContain('  mixed: (number | string | null)[];');
    expect(t).toContain('  empty: unknown[];');
    expect(t).toContain('  "my-key": boolean;');
    expect(t).toContain('  "class": string;');
  });
  it('types a root array as an alias', () => {
    const r = jsonToTs('[{"a":1},{"a":2,"b":null}]', 'Rows');
    expect(r.ok && r.text).toContain('export type Rows = Row[];');
    expect(r.ok && r.text).toContain('  b?: null;');
  });
  it('rejects an invalid root name and invalid JSON', () => {
    expect(jsonToTs('{}', '1bad').ok).toBe(false);
    expect(jsonToTs('{', 'Root').ok).toBe(false);
  });
});
