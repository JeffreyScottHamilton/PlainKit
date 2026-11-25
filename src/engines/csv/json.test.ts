import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { parseJsonTable } from './json';

describe('parseJsonTable', () => {
  it('uses keys in first-seen order across all objects, and fills missing keys with empty cells', () => {
    const t = parseJsonTable('[{"name":"Ana","age":31},{"city":"Oslo","name":"Ben"}]');
    expect(t.headers).toEqual(['name', 'age', 'city']);
    expect(t.rows).toEqual([
      ['Ana', '31', ''],
      ['Ben', '', 'Oslo'],
    ]);
  });

  it('writes null as empty, booleans as text, and nested values as JSON text', () => {
    const t = parseJsonTable('[{"a":null,"b":true,"c":{"x":1},"d":[1,"two"],"e":"say \\"hi\\", ok"}]');
    expect(t.rows[0]).toEqual(['', 'true', '{"x":1}', '[1,"two"]', 'say "hi", ok']);
  });

  it('accepts an empty array as a table with no rows and no columns', () => {
    expect(parseJsonTable('[]')).toEqual({ headers: [], rows: [] });
  });

  it('refuses invalid JSON with a next step', () => {
    expect(() => parseJsonTable('[{"a":1,}]')).toThrow(ToolError);
  });

  it('refuses a top-level object or scalar', () => {
    expect(() => parseJsonTable('{"a":1}')).toThrow(/array of objects/);
    expect(() => parseJsonTable('"text"')).toThrow(/array of objects/);
  });

  it('names the first item that is not an object', () => {
    expect(() => parseJsonTable('[{"a":1}, 5]')).toThrow('Item 2 is not an object.');
    expect(() => parseJsonTable('[[1,2]]')).toThrow('Item 1 is not an object.');
  });
});
