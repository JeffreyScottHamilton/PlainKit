import { ToolError } from '@/lib/errors';

export const MAX_DOC_BYTES = 50 * 1024 * 1024;

export type DocKind = 'docx' | 'text' | 'markdown' | 'html' | 'unsupported';

const UNSUPPORTED: Record<string, string> = {
  doc: 'Old .doc files are not supported: save as .docx first.',
  xls: 'Excel files are not supported.',
  xlsx: 'Excel files are not supported.',
  ppt: 'PowerPoint files are not supported.',
  pptx: 'PowerPoint files are not supported.',
  odt: 'OpenDocument text (.odt) is not supported: save as .docx first.',
  rtf: 'Rich Text Format (.rtf) is not supported: save as .docx first.',
  epub: 'EPUB books are not supported.',
  pages: 'Apple Pages files are not supported: export as .docx first.',
};

export type DocTarget = 'pdf' | 'txt' | 'md' | 'html';
export const TARGET_LABEL: Record<DocTarget, string> = { pdf: 'PDF', txt: 'Plain text (.txt)', md: 'Markdown (.md)', html: 'HTML (.html)' };

/** The tested pairs. Only these are offered. PDF is handled by its own panel (text only here). */
export const TARGETS: Record<Exclude<DocKind, 'unsupported'>, readonly DocTarget[]> = {
  docx: ['pdf', 'txt', 'md', 'html'],
  text: ['pdf'],
  markdown: ['pdf', 'html'],
  html: ['pdf', 'txt', 'md'],
};

export const extOf = (name: string): string => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');

/** What a document-like file is, judged by extension or MIME. Content is still validated by the engines. */
export function docKind(name: string, mime: string): DocKind | null {
  const e = extOf(name);
  if (e === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (e in UNSUPPORTED) return 'unsupported';
  if (e === 'md' || e === 'markdown' || mime === 'text/markdown') return 'markdown';
  if (e === 'html' || e === 'htm' || mime === 'text/html') return 'html';
  if (e === 'txt' || mime === 'text/plain') return 'text';
  return null;
}

/** Plain explanation for a file this tool cannot convert (empty when it can). */
export function unsupportedMessage(name: string): string {
  return UNSUPPORTED[extOf(name)] ?? 'This file type is not supported.';
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);
const NOT_DOCX = () => new ToolError('not-docx', 'This file could not be read as a Word document (.docx).', 'Old .doc files are not supported: save as .docx first.');

/** A DOCX is a ZIP (PK\x03\x04) holding word/document.xml. Names in a ZIP are stored uncompressed, so a byte search is enough. */
export function assertDocx(bytes: Uint8Array): void {
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) throw NOT_DOCX();
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) throw NOT_DOCX();
  const needle = new TextEncoder().encode('word/document.xml');
  const last = bytes.length - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    if (bytes[i] !== needle[0]) continue;
    for (let j = 1; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return;
  }
  throw NOT_DOCX();
}

export function assertSize(size: number, name: string): void {
  if (size > MAX_DOC_BYTES) throw new ToolError('too-large', `${name} is larger than 50 MB.`, 'Split the document or remove large pictures first.');
}

/** Decode text input. Honours UTF-8 and UTF-16 byte-order marks; rejects binary data. */
export function decodeText(bytes: Uint8Array): string {
  let enc = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) enc = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) enc = 'utf-16be';
  else {
    let nul = 0;
    const n = Math.min(bytes.length, 4096);
    for (let i = 0; i < n; i++) if (bytes[i] === 0) nul++;
    if (nul > 0) throw new ToolError('not-text', 'This file does not look like text.', 'Choose a plain text, Markdown or HTML file.');
  }
  return new TextDecoder(enc).decode(bytes).replace(/^﻿/, '');
}
