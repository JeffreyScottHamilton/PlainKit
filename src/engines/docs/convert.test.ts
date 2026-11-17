import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { convertDocument } from './convert';
import type { FontSet } from './pdf';
import { ToolError } from '@/lib/errors';

// Paths from the repo root: happy-dom gives import.meta.url as an http URL, which readFileSync rejects.
const font = (f: string) => new Uint8Array(readFileSync(resolve('public/fonts/doc', f)));
const fonts = async (): Promise<FontSet> => ({
  regular: font('NotoSans-Regular.ttf'),
  bold: font('NotoSans-Bold.ttf'),
  italic: font('NotoSans-Italic.ttf'),
  boldItalic: font('NotoSans-BoldItalic.ttf'),
});
const docx = () => new Blob([readFileSync(resolve('e2e/fixtures/docs/sample.docx'))]);
const text = (b: Blob) => b.text();
// Independent reader for the PDF check: pdf.js legacy build, the Node entry point.
const readPdfText = async (bytes: Uint8Array): Promise<string> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '));
  }
  return pages.join('\n');
};

describe('convertDocument', () => {
  it('DOCX to Markdown keeps headings, emphasis and the table', async () => {
    const r = await convertDocument({ kind: 'docx', name: 'plan.docx', blob: docx(), target: 'md', pageSize: 'a4' }, fonts);
    const md = await text(r.blob);
    expect(r.ext).toBe('md');
    expect(md).toContain('# Quarterly plan');
    expect(md).toContain('**This sentence is bold.**');
    expect(md).toContain('| Apples | 4 |');
  });

  it('DOCX to plain text contains the known phrase', async () => {
    const r = await convertDocument({ kind: 'docx', name: 'plan.docx', blob: docx(), target: 'txt', pageSize: 'a4' }, fonts);
    expect(await text(r.blob)).toContain('PlainKit converts Word files locally.');
  });

  it('DOCX to HTML is wrapped and sanitised', async () => {
    const r = await convertDocument({ kind: 'docx', name: 'plan.docx', blob: docx(), target: 'html', pageSize: 'a4' }, fonts);
    const html = await text(r.blob);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<h1>Quarterly plan</h1>');
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
  });

  it('DOCX to PDF writes a PDF with at least one page whose text reads back', async () => {
    const r = await convertDocument({ kind: 'docx', name: 'plan.docx', blob: docx(), target: 'pdf', pageSize: 'letter' }, fonts, readPdfText);
    expect(r.blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(await readPdfText(bytes)).toContain('PlainKit converts Word files locally.');
  });

  it('HTML to plain text keeps the text and drops the script', async () => {
    const src = '<h1>Title</h1><p>Body <b>text</b>.</p><script>evil()</script><ul><li>item</li></ul>';
    const r = await convertDocument({ kind: 'html', name: 'a.html', blob: new Blob([src]), target: 'txt', pageSize: 'a4' }, fonts);
    const txt = await text(r.blob);
    expect(txt).toContain('Body text.');
    expect(txt).toContain('• item');
    expect(txt).not.toContain('evil');
  });

  it('Markdown to HTML removes script and unsafe links', async () => {
    const src = 'Hello **world**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))';
    const r = await convertDocument({ kind: 'markdown', name: 'a.md', blob: new Blob([src]), target: 'html', pageSize: 'a4' }, fonts);
    const html = await text(r.blob);
    expect(html).toContain('<strong>world</strong>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  it('a corrupted DOCX is reported as not a Word file, not a crash', async () => {
    const bad = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])]);
    await expect(convertDocument({ kind: 'docx', name: 'bad.docx', blob: bad, target: 'txt', pageSize: 'a4' }, fonts)).rejects.toMatchObject({ code: 'not-docx' });
  });

  it('refuses a target the matrix does not offer', async () => {
    const err = await convertDocument({ kind: 'text', name: 'a.txt', blob: new Blob(['hi']), target: 'md', pageSize: 'a4' }, fonts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).code).toBe('unsupported-target');
  });

  it('a file with no text is an explicit error', async () => {
    await expect(convertDocument({ kind: 'text', name: 'empty.txt', blob: new Blob(['   \n  ']), target: 'pdf', pageSize: 'a4' }, fonts)).rejects.toMatchObject({ code: 'empty' });
  });
});
