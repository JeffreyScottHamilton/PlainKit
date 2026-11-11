import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { decodeBytes } from './decode';
import { parseCsv, displayHeaders, type Table } from './table';
import { dedupe, deleteColumn, findReplace, moveColumn, removeEmptyRows, renameColumn, splitColumn, trimCells } from './ops';
import { exportTable, formulaCellCount, type ExportOptions } from './export';
import { canRedo, canUndo, current, pushHistory, redo, startHistory, undo } from './history';

const enc = (s: string) => new TextEncoder().encode(s);
const base: ExportOptions = { format: 'csv', delimiter: ',', eol: 'LF', bom: false, quoteAll: false, formulaSafe: false, includeHeader: true };
const P = (text: string, delimiter: 'auto' | string = 'auto', header = true) => parseCsv(text, { delimiter, quote: '"', header });

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

describe('parse', () => {
  it('handles quoted delimiters, quoted newlines and escaped quotes', () => {
    const r = P('name,note\n"Smith, J","line1\nline2"\n"say ""hi""",x\n');
    expect(r.table.headers).toEqual(['name', 'note']);
    expect(r.table.rows).toEqual([
      ['Smith, J', 'line1\nline2'],
      ['say "hi"', 'x'],
    ]);
    expect(r.raggedRows).toBe(0);
  });

  it('keeps empty fields and a trailing newline is not a data row', () => {
    const r = P('a,b,c\n,,\n1,,3\n');
    expect(r.table.rows).toEqual([
      ['', '', ''],
      ['1', '', '3'],
    ]);
  });

  it('auto-detects semicolon and tab delimiters and reports the one used', () => {
    expect(P('a;b\n1;2\n').delimiter).toBe(';');
    expect(P('a;b\n1;2\n').table.rows).toEqual([['1', '2']]);
    const t = P('a\tb\n1\t2\n');
    expect(t.delimiter).toBe('\t');
    expect(t.delimiterAuto).toBe(true);
  });

  it('pads ragged rows and counts them', () => {
    const r = P('a,b,c\n1,2\n1,2,3,4\n5,6,7\n');
    expect(r.raggedRows).toBe(2);
    expect(r.table.headers).toEqual(['a', 'b', 'c', '', '']);
    expect(r.table.rows[0]).toEqual(['1', '2', '', '', '']);
    expect(r.table.rows[1]).toEqual(['1', '2', '3', '4', '']);
  });

  it('header off keeps every row as data with empty synthetic headers', () => {
    const r = P('x,y\n1,2\n', 'auto', false);
    expect(r.table.rows).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
    expect(displayHeaders(r.table.headers)).toEqual(['Column 1', 'Column 2']);
  });

  it('keeps non-Latin and emoji text intact', () => {
    const r = P('名前,مرحبا,emoji\n"東京, 日本",ابجد,🎉👍\n');
    expect(r.table.headers).toEqual(['名前', 'مرحبا', 'emoji']);
    expect(r.table.rows[0]).toEqual(['東京, 日本', 'ابجد', '🎉👍']);
  });

  it('rejects a quote character equal to the delimiter or longer than one character', () => {
    expect(() => parseCsv('a', { delimiter: ',', quote: ',', header: true })).toThrow(/cannot also be the delimiter/);
    expect(() => parseCsv('a', { delimiter: ',', quote: '""', header: true })).toThrow(/exactly one character/);
  });
});

describe('display headers', () => {
  it('disambiguates duplicates and names empty headers, without clashing', () => {
    expect(displayHeaders(['name', 'name', 'name (2)', '', '  '])).toEqual(['name', 'name (3)', 'name (2)', 'Column 4', 'Column 5']);
  });
});

describe('decode', () => {
  it('strips UTF-8 BOM and reports it', () => {
    const d = decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('a,b')]), 'auto');
    expect(d.text).toBe('a,b');
    expect(d.bom).toBe(true);
    expect(d.encoding).toMatch(/UTF-8/);
  });

  it('decodes UTF-16LE with BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, ...Buffer.from('名前,x\n', 'utf16le')]);
    const d = decodeBytes(bytes, 'auto');
    expect(d.text).toBe('名前,x\n');
    expect(d.encoding).toMatch(/UTF-16LE/);
  });

  it('decodes UTF-16BE when chosen explicitly', () => {
    const be = Buffer.from('a,é\n', 'utf16le').swap16();
    expect(decodeBytes(new Uint8Array(be), 'utf-16be').text).toBe('a,é\n');
  });

  it('falls back to Windows-1252 when bytes are not valid UTF-8 and says so', () => {
    const d = decodeBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), 'auto'); // "café" in Windows-1252
    expect(d.text).toBe('café');
    expect(d.encoding).toMatch(/Windows-1252 \(fallback/);
  });

  it('ISO-8859-1 maps each byte to the same code point', () => {
    expect(decodeBytes(new Uint8Array([0x80, 0xe9]), 'iso-8859-1').text).toBe('\u0080é');
  });
});

describe('operations', () => {
  const t: Table = {
    headers: ['name', 'city'],
    rows: [
      ['Ann', 'Oslo'],
      ['ann ', 'Oslo'],
      ['  Ann', 'Oslo'],
      ['', ''],
      ['Bo', 'Rome'],
      ['Ann', 'Oslo'],
    ],
  };

  it('trim counts changed cells and keeps unchanged rows by reference', () => {
    const r = trimCells(t, null);
    expect(r.summary.changedCells).toBe(3);
    expect(r.table.rows[4]).toBe(t.rows[4]);
    expect(r.table.rows[1]).toEqual(['ann', 'Oslo']);
  });

  it('removes empty rows', () => {
    expect(removeEmptyRows(t).summary.removedRows).toBe(1);
  });

  it('exact dedupe and normalized dedupe give different counts', () => {
    expect(dedupe(t, null, 'exact').summary.removedRows).toBe(1);
    expect(dedupe(t, null, 'normalized').summary.removedRows).toBe(3);
    expect(dedupe(t, null, 'normalized').table.rows.map((r) => r[0])).toEqual(['Ann', '', 'Bo']);
  });

  it('dedupe by a selected column only', () => {
    expect(dedupe(t, [1], 'exact').summary.removedRows).toBe(4);
  });

  it('dedupe refuses an empty column selection instead of collapsing everything', () => {
    expect(() => dedupe(t, [], 'exact')).toThrow(/Select at least one column/);
  });

  it('rename, move, and delete columns', () => {
    expect(renameColumn(t, 1, 'town').table.headers).toEqual(['name', 'town']);
    const m = moveColumn(t, 0, 1).table;
    expect(m.headers).toEqual(['city', 'name']);
    expect(m.rows[4]).toEqual(['Rome', 'Bo']);
    expect(() => moveColumn(t, 0, -1)).toThrow(/cannot move/);
    const d = deleteColumn(t, 1).table;
    expect(d.headers).toEqual(['name']);
    expect(d.rows[0]).toEqual(['Ann']);
  });

  it('split a column into N new columns, keeping overflow in the last one', () => {
    const s = splitColumn({ headers: ['full', 'x'], rows: [['a-b-c', '1'], ['d', '2']] }, 0, '-', 2);
    expect(s.table.headers).toEqual(['full 1', 'full 2', 'x']);
    expect(s.table.rows).toEqual([
      ['a', 'b-c', '1'],
      ['d', '', '2'],
    ]);
    expect(s.summary.changedCells).toBe(1);
    expect(s.summary.note).toMatch(/1 cells had more parts/);
    expect(() => splitColumn(t, 0, '', 2)).toThrow(/cannot be empty/);
  });

  it('find and replace: plain text is literal, case handling works, regex errors are explicit', () => {
    const plain = findReplace({ headers: ['v'], rows: [['Price $5'], ['price $5']] }, { find: 'price $5', replace: '$1 cost', regex: false, matchCase: false, scope: null });
    expect(plain.table.rows).toEqual([['$1 cost'], ['$1 cost']]);
    expect(plain.summary.changedCells).toBe(2);
    const cs = findReplace({ headers: ['v'], rows: [['Ann'], ['ann']] }, { find: 'Ann', replace: 'X', regex: false, matchCase: true, scope: null });
    expect(cs.summary.changedCells).toBe(1);
    const re = findReplace({ headers: ['v'], rows: [['a1b22']] }, { find: '(\\d+)', replace: '<$1>', regex: true, matchCase: true, scope: null });
    expect(re.table.rows[0]).toEqual(['a<1>b<22>']);
    expect(() => findReplace(t, { find: '(', replace: '', regex: true, matchCase: true, scope: null })).toThrow(/Invalid regular expression/);
  });

  it('find and replace respects column scope', () => {
    const r = findReplace(t, { find: 'Oslo', replace: 'Bergen', regex: false, matchCase: true, scope: [0] });
    expect(r.summary.changedCells).toBe(0);
  });

  it('never mutates the input table', () => {
    const frozen = deepFreeze({ headers: ['a', 'b'], rows: [[' x ', 'y'], ['', '']] } as Table);
    expect(() => {
      trimCells(frozen, null);
      removeEmptyRows(frozen);
      dedupe(frozen, null, 'exact');
      moveColumn(frozen, 0, 1);
      splitColumn(frozen, 0, ' ', 2);
      findReplace(frozen, { find: 'x', replace: 'z', regex: false, matchCase: true, scope: null });
    }).not.toThrow();
    expect(frozen.rows[0]?.[0]).toBe(' x ');
  });
});

describe('undo and redo', () => {
  it('moves through states and drops redo on a new edit', () => {
    let h = startHistory('raw');
    h = pushHistory(h, 'a', 30);
    h = pushHistory(h, 'b', 30);
    expect(current(undo(h))).toBe('a');
    expect(canRedo(undo(h))).toBe(true);
    const branched = pushHistory(undo(h), 'c', 30);
    expect(canRedo(branched)).toBe(false);
    expect(current(undo(undo(undo(branched))))).toBe('raw');
    expect(canUndo(undo(undo(undo(branched))))).toBe(false);
    expect(current(redo(undo(branched)))).toBe('c');
  });

  it('is bounded to 30 undo steps', () => {
    let h = startHistory(0);
    for (let i = 1; i <= 50; i++) h = pushHistory(h, i, 30);
    let steps = 0;
    while (canUndo(h)) {
      h = undo(h);
      steps++;
    }
    expect(steps).toBe(30);
    expect(current(h)).toBe(20);
  });
});

describe('formula-safe policy', () => {
  const t: Table = {
    headers: ['=sum', 'v'],
    rows: [
      ['=1+1', '+5'],
      ['-3', '@x'],
      ['\tTab', 'ok'],
      ['plain', 'a\rb'],
    ],
  };

  it('counts cells that would change, headers included when exported', () => {
    expect(formulaCellCount(t, true)).toBe(7);
    expect(formulaCellCount(t, false)).toBe(6);
  });

  it('off by default: values are unchanged', () => {
    const out = exportTable(t, base);
    expect(out.formulaCells).toBe(0);
    expect(out.text).toContain('=1+1');
  });

  it('on: prefixes risky cells with an apostrophe and reports the count', () => {
    const out = exportTable(t, { ...base, formulaSafe: true });
    expect(out.formulaCells).toBe(7);
    expect(Papa.parse<string[]>(out.text, { skipEmptyLines: false }).data[1]?.[0]).toBe("'=1+1");
  });
});

describe('export round trip', () => {
  const rows: string[][] = Array.from({ length: 5000 }, (_, i) => [
    String(i),
    `Person ${i}, "Jr" ${i % 7 === 0 ? 'ünï 名前 🎉' : 'plain'}`,
    i % 5 === 0 ? 'line one\nline two' : `note ${i}`,
    i % 11 === 0 ? '' : String(i * 3),
  ]);
  const table: Table = { headers: ['id', 'name', 'note', 'score'], rows };

  it('CSV: re-parses to the same row count and cell values', () => {
    const out = exportTable(table, { ...base, quoteAll: false });
    expect(out.verifiedRows).toBe(5000);
    const back = Papa.parse<string[]>(out.text, { skipEmptyLines: false }).data;
    expect(back.length).toBe(5001);
    expect(back[6]?.[2]).toBe('line one\nline two');
    expect(back[1]?.[1]).toBe('Person 0, "Jr" ünï 名前 🎉');
  });

  it('CSV with quote-all, CRLF and BOM still re-parses to 5000 rows', () => {
    const out = exportTable(table, { ...base, quoteAll: true, eol: 'CRLF', bom: true });
    expect(out.text.startsWith('﻿')).toBe(true);
    expect(out.text).toContain('\r\n');
    const back = Papa.parse<string[]>(out.text.slice(1), { newline: '\r\n', skipEmptyLines: false }).data;
    expect(back.length - 1).toBe(5000);
    expect(out.verifiedRows).toBe(5000);
  });

  it('TSV: re-parses to 5000 rows with tab delimiter', () => {
    const out = exportTable(table, { ...base, format: 'tsv', delimiter: '\t' });
    expect(out.ext).toBe('tsv');
    expect(out.verifiedRows).toBe(5000);
    expect(Papa.parse<string[]>(out.text, { delimiter: '\t', skipEmptyLines: false }).data.length - 1).toBe(5000);
  });

  it('JSON: array of 5000 objects with the same values, duplicate headers disambiguated and stated', () => {
    const dup: Table = { headers: ['id', 'id', ''], rows: [['1', '2', '3']] };
    const j = exportTable(dup, { ...base, format: 'json' });
    expect(j.renamedHeaders).toBe(1);
    expect(JSON.parse(j.text)).toEqual([{ id: '1', 'id (2)': '2', 'Column 3': '3' }]);

    const big = exportTable(table, { ...base, format: 'json' });
    const parsed = JSON.parse(big.text) as Record<string, string>[];
    expect(parsed.length).toBe(5000);
    expect(parsed[1]?.name).toBe('Person 1, "Jr" plain');
    expect(big.verifiedRows).toBe(5000);
  });

  it('header off: exports rows only', () => {
    const out = exportTable({ headers: ['', ''], rows: [['a', 'b']] }, { ...base, includeHeader: false });
    expect(out.text).toBe('a,b\n');
    expect(out.verifiedRows).toBe(1);
  });

  it('a single-column table with empty values round-trips', () => {
    const out = exportTable({ headers: ['v'], rows: [[''], ['x'], ['']] }, base);
    expect(out.verifiedRows).toBe(3);
  });
});
