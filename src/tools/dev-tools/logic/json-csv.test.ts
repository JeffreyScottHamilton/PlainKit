import { describe, expect, it } from 'vitest';
import { csvToJson, jsonToCsv } from './json-csv';

describe('json-csv', () => {
  it('round-trips quoted commas, quotes, and newlines', () => {
    const json = JSON.stringify([{ name: 'Lee, Ann', note: 'said "hi"\nthen left', n: 3 }]);
    const csv = jsonToCsv(json, ',');
    expect(csv.ok).toBe(true);
    if (!csv.ok) return;
    expect(csv.output).toBe('name,note,n\r\n"Lee, Ann","said ""hi""\nthen left",3');
    const back = csvToJson(csv.output, ',');
    expect(back).toEqual({ ok: true, rows: 1, output: JSON.stringify([{ name: 'Lee, Ann', note: 'said "hi"\nthen left', n: '3' }], null, 2) });
  });

  it('unions keys in first-seen order and JSON-stringifies nested values', () => {
    const r = jsonToCsv('[{"a":1,"b":{"x":2}},{"c":true,"a":null}]', ';');
    expect(r).toEqual({ ok: true, rows: 2, output: 'a;b;c\r\n1;"{""x"":2}";\r\n;;true' });
  });

  it('strips a BOM and reports row numbers for bad CSV', () => {
    const ok = csvToJson('﻿id,name\n1,a\n', ',');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.output).toContain('"id": "1"');
    const bad = csvToJson('a,b\n1,2\n3\n', ',');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/^Row 2:/);
  });

  it('rejects non-array JSON with a clear error', () => {
    const r = jsonToCsv('{"a":1}', ',');
    expect(r).toEqual({ ok: false, error: 'The top level must be an array, such as [{"a":1}].' });
  });
});
