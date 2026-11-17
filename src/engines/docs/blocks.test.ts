import { describe, expect, it } from 'vitest';
import { htmlToBlocks, textToBlocks, blockText, type Block, type Para } from './blocks';
import { parseHtml, toSafeHtml, decodeEntities } from './html';
import { wrapRuns, paginate, splitRow, findMissing, type Metrics, type Box, type RowBox, type LineBox } from './layout';
import { blocksToMarkdown, blocksToText } from './export';
import { docKind, unsupportedMessage, decodeText, TARGETS } from './kinds';

// Every glyph is half the font size wide, so line and page maths are exact.
const metrics: Metrics = { width: (t, _s, size) => [...t].length * size * 0.5 };
const paras = (bs: Block[]) => bs.filter((b): b is Para => b.type === 'para');

describe('HTML reader', () => {
  it('reads nested elements, attributes and entities', () => {
    const root = parseHtml('<p class="x">A &amp; B &#233; &#x41;</p>');
    const p = root.kids[0] as { tag: string; attrs: Record<string, string>; kids: { text?: string }[] };
    expect(p.tag).toBe('p');
    expect(p.attrs.class).toBe('x');
    expect(p.kids[0]!.text).toBe('A & B é A');
  });

  it('closes an open paragraph before a block element and list items before the next item', () => {
    const bs = htmlToBlocks('<p>one<div>two</div><ul><li>a<li>b</ul>');
    expect(blockText(bs)).toEqual(['one', 'two', 'a •', 'b •']);
  });

  it('drops scripts and styles with their content, and never throws on junk', () => {
    const bs = htmlToBlocks('<script>alert(1)</script><style>p{}</style><p>safe <b>text</b></p><<<>>> <p unclosed');
    const text = blockText(bs).join('|');
    expect(text).not.toContain('alert');
    expect(text).toContain('safe text');
  });

  it('keeps only whitelisted tags, safe links and data-URI pictures in output markup', () => {
    const out = toSafeHtml(parseHtml('<p onclick="x()"><a href="javascript:alert(1)">bad</a> <a href="https://e.org/?a=1&b=2">ok</a></p><img src="http://x/y.png"><img src="data:image/png;base64,iVBORw0KGgo=" alt="pic"><iframe src="x"></iframe>').kids);
    expect(out).not.toContain('javascript');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('http://x/y.png');
    expect(out).not.toContain('iframe');
    expect(out).toContain('href="https://e.org/?a=1&amp;b=2"');
    expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('decodes entities once and leaves unknown names alone', () => {
    expect(decodeEntities('&amp;lt; &unknown; &copy;')).toBe('&lt; &unknown; ©');
  });
});

describe('block model', () => {
  it('turns headings into bold paragraphs that remember their level', () => {
    const [h] = paras(htmlToBlocks('<h2>Title</h2>'));
    expect(h!.bold).toBe(true);
    expect(h!.level).toBe(2);
    expect(h!.size).toBe(18);
  });

  it('numbers ordered lists and gives unordered lists a bullet, nested items indent', () => {
    const bs = paras(htmlToBlocks('<ol><li>first<ul><li>sub</li></ul></li><li>second</li></ol>'));
    expect(bs.map((b) => b.marker)).toEqual(['1.', '–', '2.']);
    expect(bs[1]!.indent).toBeGreaterThan(bs[0]!.indent);
  });

  it('keeps bold, italic and link runs, and drops unsafe links', () => {
    const [p] = paras(htmlToBlocks('<p><strong>b</strong><em>i</em><a href="javascript:x">n</a><a href="https://a.b">l</a></p>'));
    const runs = p!.runs;
    expect(runs.find((r) => r.text === 'b')!.bold).toBe(true);
    expect(runs.find((r) => r.text === 'i')!.italic).toBe(true);
    expect(runs.find((r) => r.text === 'l')!.href).toBe('https://a.b');
    expect(runs.find((r) => r.text === 'n')!.href).toBeUndefined();
  });

  it('builds a table with colspan and carries rowspan into the next row as placeholders', () => {
    const [t] = htmlToBlocks('<table><tr><td rowspan="2">A</td><td colspan="2">B</td></tr><tr><td>C</td><td>D</td></tr></table>');
    if (!t || t.type !== 'table') throw new Error('expected a table');
    expect(t.rows[0]!.map((c) => c.colspan)).toEqual([1, 2]);
    expect(t.rows[1]!.map((c) => c.blocks.length > 0)).toEqual([false, true, true]);
  });

  it('turns a page-break marker into a break block and a plain rule into a rule', () => {
    const bs = htmlToBlocks('<p>a</p><hr class="pk-pagebreak"><hr><p>b</p>');
    expect(bs.map((b) => b.type)).toEqual(['para', 'break', 'rule', 'para']);
  });

  it('keeps each text line as its own paragraph', () => {
    expect(blockText(textToBlocks('one\n\ttwo\n'))).toEqual(['one', '    two', '']);
  });
});

describe('line wrapping', () => {
  it('breaks at spaces and never starts a line with a space', () => {
    const lines = wrapRuns([{ text: 'aaa bbb ccc ddd' }], 60, 10, metrics);
    const text = lines.map((l) => l.toks.map((t) => t.text).join(''));
    expect(text).toEqual(['aaa bbb ccc', 'ddd']);
  });

  it('splits a word wider than the line by character', () => {
    const lines = wrapRuns([{ text: 'abcdefghij' }], 30, 10, metrics);
    expect(lines.map((l) => l.toks.map((t) => t.text).join(''))).toEqual(['abcdef', 'ghij']);
  });

  it('keeps explicit line breaks when preserving text', () => {
    const lines = wrapRuns([{ text: 'a' }, { text: '', br: true }, { text: 'b' }], 500, 10, metrics, false, true);
    expect(lines.length).toBe(2);
  });
});

describe('pagination', () => {
  const line = (h: number): LineBox => ({ kind: 'line', x: 0, size: 10, pieces: [], height: h, before: 0, after: 0, bold: false });

  it('starts a new page at a break and never leaves a blank page for two breaks in a row', () => {
    const boxes: Box[] = [line(10), { kind: 'break', height: 0, before: 0, after: 0 }, { kind: 'break', height: 0, before: 0, after: 0 }, line(10)];
    const pages = paginate(boxes, 100);
    expect(pages.map((p) => p.length)).toEqual([1, 1]);
  });

  it('moves a box that does not fit to the next page', () => {
    const pages = paginate([line(60), line(60)], 100);
    expect(pages.length).toBe(2);
    expect(pages[1]![0]!.y).toBe(0);
  });

  it('splits a row taller than a page between its lines', () => {
    const row: RowBox = { kind: 'row', x: 0, width: 100, height: 300, before: 0, after: 0, cells: [{ x: 0, w: 100, header: false, boxes: [line(40), line(40), line(40), line(40), line(40)] }] };
    const pages = paginate([row], 120);
    expect(pages.length).toBeGreaterThan(1);
    const { head, tail } = splitRow(row, 60, false);
    expect(head!.cells[0]!.boxes.length).toBe(1);
    expect(tail!.cells[0]!.boxes.length).toBe(4);
  });
});

describe('missing glyphs', () => {
  it('counts characters the font lacks, ignoring whitespace', () => {
    const r = findMissing(['ab 漢字', 'x'], (cp) => cp < 0x100);
    expect(r.count).toBe(2);
    expect(r.examples.sort()).toEqual(['字', '漢']);
  });
});

describe('text and Markdown output', () => {
  const bs = htmlToBlocks('<h1>Head</h1><p>Some <b>bold</b> and <i>it</i> <a href="https://x.y">link</a>.</p><ul><li>one</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2 | 3</td></tr></table>');

  it('writes headings, emphasis, links, lists and tables as Markdown', () => {
    const md = blocksToMarkdown(bs).text;
    expect(md).toContain('# Head');
    expect(md).toContain('Some **bold** and *it* [link](https://x.y).');
    expect(md).toContain('- one');
    expect(md).toContain('| A | B |');
    expect(md).toContain('| 1 | 2 \\| 3 |');
  });

  it('writes plain text with list markers and tab-separated table cells', () => {
    const txt = blocksToText(bs);
    expect(txt).toContain('Head');
    expect(txt).toContain('• one');
    expect(txt).toContain('A\tB');
  });

  it('counts pictures it had to leave out', () => {
    const md = blocksToMarkdown(htmlToBlocks('<p>x</p><img src="data:image/png;base64,AAAA">'));
    expect(md.pictures).toBe(1);
  });
});

describe('file kinds', () => {
  it('judges by extension or MIME and flags legacy formats as unsupported', () => {
    expect(docKind('a.DOCX', '')).toBe('docx');
    expect(docKind('a.md', '')).toBe('markdown');
    expect(docKind('a.txt', 'text/plain')).toBe('text');
    expect(docKind('a.htm', '')).toBe('html');
    expect(docKind('a.doc', 'application/msword')).toBe('unsupported');
    expect(docKind('a.rtf', '')).toBe('unsupported');
    expect(docKind('a.csv', 'text/csv')).toBeNull();
    expect(unsupportedMessage('old.doc')).toMatch(/save as .docx first/);
  });

  it('offers only the tested target pairs', () => {
    expect(TARGETS.docx).toEqual(['pdf', 'txt', 'md', 'html']);
    expect(TARGETS.text).toEqual(['pdf']);
  });

  it('rejects binary input as text', () => {
    expect(() => decodeText(new Uint8Array([0x50, 0, 0x4b, 1]))).toThrow(/does not look like text/);
    expect(decodeText(new TextEncoder().encode('﻿hi'))).toBe('hi');
  });
});
