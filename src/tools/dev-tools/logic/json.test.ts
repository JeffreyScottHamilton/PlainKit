import { describe, expect, it } from 'vitest';
import { formatJson } from './json';

describe('json', () => {
  it('sorts keys recursively and formats with the chosen indent', () => {
    const r = formatJson('{"b":1,"a":[{"d":1,"c":2}]}', '2', true);
    expect(r).toEqual({ ok: true, text: JSON.stringify({ a: [{ c: 2, d: 1 }], b: 1 }, null, 2) });
  });
  it('minifies and uses tabs', () => {
    expect(formatJson('{ "a" : [ 1 , 2 ] }', 'minify', false)).toEqual({ ok: true, text: '{"a":[1,2]}' });
    expect(formatJson('{"a":1}', 'tab', false)).toEqual({ ok: true, text: '{\n\t"a": 1\n}' });
  });
  it('reports line and column for a syntax error without throwing', () => {
    const r = formatJson('{\n"a": 1,\n}', '2', false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('line 3, column 1');
  });
  it('rejects empty input', () => {
    expect(formatJson('  ', '2', false)).toEqual({ ok: false, message: 'Paste some JSON first.' });
  });
});
