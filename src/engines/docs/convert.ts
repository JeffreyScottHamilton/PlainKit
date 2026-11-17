// One document in, one converted file out. Pure apart from the libraries it calls, so it can be tested in Node.
import { marked } from 'marked';
import mammoth from 'mammoth/mammoth.browser';
import { ToolError } from '@/lib/errors';
import { htmlToBlocks, textToBlocks, blockText, type Block } from './blocks';
import { assertDocx, assertSize, decodeText, TARGETS, type DocTarget } from './kinds';
import { blocksToMarkdown, blocksToText } from './export';
import { esc, parseHtml, toSafeHtml } from './html';
import { blocksToPdf, type FontSet, type PageSize } from './pdf';
import { pdfToText } from './pdftext';

export type SourceKind = 'docx' | 'text' | 'markdown' | 'html' | 'pdf';
export type DocRequest = { kind: SourceKind; name: string; blob: Blob; target: DocTarget; pageSize: PageSize };
/** The blob's type is the output MIME. ext is the file extension without the dot. */
export type DocResult = { blob: Blob; ext: string; warnings: string[] };

const OUT: Record<DocTarget, { ext: string; type: string }> = {
  pdf: { ext: 'pdf', type: 'application/pdf' },
  txt: { ext: 'txt', type: 'text/plain;charset=utf-8' },
  md: { ext: 'md', type: 'text/markdown;charset=utf-8' },
  html: { ext: 'html', type: 'text/html;charset=utf-8' },
};

const out = (target: DocTarget, body: string | Uint8Array, warnings: string[]): DocResult => ({
  blob: new Blob([body as BlobPart], { type: OUT[target].type }),
  ext: OUT[target].ext,
  warnings,
});

/** A full HTML file around sanitised body markup. Written by us, so it has no scripts or remote content. */
function htmlFile(title: string, bodyHtml: string): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>\n`;
}

/** Reads the text of a PDF. The worker uses pdf.js; tests pass another reader so the check stays independent of the writer. */
export type PdfTextReader = (bytes: Uint8Array) => Promise<string>;
const productionReader: PdfTextReader = async (b) => (await pdfToText(b)).text;

/** Converts a document. fonts is called only for PDF output, so text-only jobs never load them. */
export async function convertDocument(req: DocRequest, fonts: () => Promise<FontSet>, readPdfText: PdfTextReader = productionReader): Promise<DocResult> {
  const bytes = new Uint8Array(await req.blob.arrayBuffer());
  assertSize(bytes.length, req.name);

  if (req.kind === 'pdf') {
    if (req.target !== 'txt') throw new ToolError('unsupported-target', 'A PDF can only be turned into plain text here.', 'Choose plain text, or use the PDF panel for pictures.');
    const text = await readPdfText(bytes);
    if (!text.trim()) throw new ToolError('no-text', `${req.name} has no text layer, so there is no text to extract.`, 'It is probably a scan or pictures of pages. Scanned PDFs need OCR, which this tool does not do.');
    return out('txt', text + '\n', []);
  }

  if (!(TARGETS[req.kind] as readonly DocTarget[]).includes(req.target)) {
    throw new ToolError('unsupported-target', `This file cannot be saved as ${req.target.toUpperCase()} here.`, 'Choose one of the formats offered for this file.');
  }

  const warnings: string[] = [];
  let html = '';
  let blocks: Block[];
  if (req.kind === 'docx') {
    assertDocx(bytes);
    const r = await mammoth.convertToHtml({ arrayBuffer: bytes.slice().buffer }, { convertImage: mammoth.images.dataUri });
    html = r.value;
    blocks = htmlToBlocks(html);
  } else if (req.kind === 'markdown') {
    html = marked.parse(decodeText(bytes), { async: false, gfm: true });
    blocks = htmlToBlocks(html);
  } else if (req.kind === 'html') {
    html = decodeText(bytes);
    blocks = htmlToBlocks(html);
  } else blocks = textToBlocks(decodeText(bytes));

  if (!blockText(blocks).some((s) => s.trim())) {
    throw new ToolError('empty', `${req.name} has no text to convert.`, 'Check that the file is not empty. Pictures alone are not converted.');
  }

  if (req.target === 'pdf') {
    const pdf = await blocksToPdf(blocks, await fonts(), req.pageSize);
    // The output must yield text when read back by a second reader, not just open.
    const check = await readPdfText(pdf.bytes);
    if (!check.trim()) throw new ToolError('verify', 'The PDF was written but has no readable text.', 'Try again, or export as Markdown or text instead.');
    return out('pdf', pdf.bytes, [...warnings, ...pdf.warnings]);
  }
  if (req.target === 'txt') return out('txt', blocksToText(blocks), warnings);
  if (req.target === 'md') {
    const md = blocksToMarkdown(blocks);
    if (md.pictures) warnings.push(`${md.pictures} picture${md.pictures === 1 ? ' was' : 's were'} left out: Markdown here is text only.`);
    return out('md', md.text, warnings);
  }
  return out('html', htmlFile(req.name.replace(/\.[^.]+$/, ''), toSafeHtml(parseHtml(html).kids)), warnings);
}
