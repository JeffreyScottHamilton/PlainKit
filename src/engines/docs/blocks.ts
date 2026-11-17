// HTML (already sanitised or trusted tool output) -> a small block model the layout engine understands. Pure.
import { parseHtml, type Elem, type Node } from './html';

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; href?: string; br?: boolean; img?: string; alt?: string };
export type Para = { type: 'para'; runs: Run[]; size: number; bold: boolean; indent: number; marker?: string; before: number; after: number; quote: boolean; preserve: boolean; level?: number };
export type ImageBlock = { type: 'image'; src: string; alt: string; indent: number };
export type Rule = { type: 'rule' };
export type PageBreak = { type: 'break' };
export type Cell = { blocks: Block[]; colspan: number; header: boolean };
export type Table = { type: 'table'; rows: Cell[][] };
export type Block = Para | ImageBlock | Rule | PageBreak | Table;

export const BODY_SIZE = 11;
export const CELL_SIZE = 10;
export const HEADING_SIZE = [22, 18, 15, 13, 12, 11] as const;
export const LIST_INDENT = 22;
export const QUOTE_INDENT = 18;

const SKIP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'canvas', 'audio', 'video', 'form', 'input', 'button', 'select', 'textarea']);
const CONTAINER = new Set(['div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'address', 'details', 'summary', 'center', 'tbody', 'thead', 'tfoot', 'caption', 'fieldset', 'hgroup']);

type Style = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; href?: string };
type Ctx = { indent: number; quote: boolean; inList: boolean; inCell: boolean; marker: { text: string } | null };

/** Control characters, zero-width characters and soft hyphens never reach the layout. */
// eslint-disable-next-line no-control-regex
export const cleanText = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f­​-‍⁠﻿]/g, '').replace(/ /g, ' ');

const safeHref = (h: string | undefined): string | undefined => (h && /^(https?:|mailto:)/i.test(h.trim()) ? h.trim() : undefined);

const textOf = (el: Elem): string => el.kids.map((k) => (k.t === 'text' ? k.text : textOf(k))).join('');

function inline(node: Node, style: Style, runs: Run[]): void {
  if (node.t === 'text') {
    const text = cleanText(node.text.replace(/[ \t\r\n\f]+/g, ' '));
    if (text) runs.push({ text, ...style });
    return;
  }
  const tag = node.tag;
  if (SKIP.has(tag)) return;
  if (tag === 'br') return void runs.push({ text: '', br: true });
  if (tag === 'img') {
    const src = node.attrs.src;
    if (src) runs.push({ text: '', img: src, alt: node.attrs.alt ?? '' });
    return;
  }
  const s: Style = { ...style };
  if (tag === 'b' || tag === 'strong') s.bold = true;
  else if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn') s.italic = true;
  else if (tag === 'u' || tag === 'ins') s.underline = true;
  else if (tag === 's' || tag === 'strike' || tag === 'del') s.strike = true;
  else if (tag === 'a') {
    const href = safeHref(node.attrs.href);
    if (href) {
      s.href = href;
      s.underline = true;
    }
  }
  node.kids.forEach((c) => inline(c, s, runs));
}

const sameStyle = (a: Run, b: Run) => !a.br && !b.br && !a.img && !b.img && !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && !!a.strike === !!b.strike && a.href === b.href;

/** Merge runs of equal style, collapse doubled spaces, trim the ends and the space around line breaks. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  let prevSpace = true;
  for (const r of runs) {
    if (r.br) {
      const last = out[out.length - 1];
      if (last && !last.br && last.text.endsWith(' ')) last.text = last.text.slice(0, -1);
      out.push({ text: '', br: true });
      prevSpace = true;
      continue;
    }
    let t = r.text;
    if (prevSpace) t = t.replace(/^ +/, '');
    if (!t) continue;
    prevSpace = t.endsWith(' ');
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) last.text += t;
    else out.push({ ...r, text: t });
  }
  const last = out[out.length - 1];
  if (last && !last.br) last.text = last.text.replace(/ +$/, '');
  return out.filter((r) => r.br || r.text);
}

const hasContent = (runs: Run[]) => runs.some((r) => r.br || r.text.trim());

type ParaOpts = { size: number; bold: boolean; before: number; after: number; preserve?: boolean; level?: number };

function emit(runs: Run[], ctx: Ctx, o: ParaOpts, out: Block[]): void {
  // Pictures split a paragraph: text before, the picture, text after.
  let cur: Run[] = [];
  const flush = () => {
    const rs = o.preserve ? cur : normalizeRuns(cur);
    cur = [];
    if (!hasContent(rs) && !o.preserve) return;
    const marker = ctx.marker?.text;
    if (ctx.marker) ctx.marker = null;
    out.push({ type: 'para', runs: rs, size: o.size, bold: o.bold, indent: ctx.indent, marker, before: o.before, after: o.after, quote: ctx.quote, preserve: !!o.preserve, level: o.level });
  };
  for (const r of runs) {
    if (r.img) {
      flush();
      out.push({ type: 'image', src: r.img, alt: r.alt ?? '', indent: ctx.indent });
    } else cur.push(r);
  }
  flush();
}

const alpha = (n: number) => {
  let s = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
  return s;
};
const roman = (n: number) => {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
};
export function listMarker(ordered: boolean, depth: number, n: number): string {
  if (!ordered) return depth % 2 === 0 ? '•' : '–';
  return `${depth % 3 === 0 ? String(n) : depth % 3 === 1 ? alpha(n) : roman(n)}.`;
}

const classes = (el: Elem) => (el.attrs.class ?? '').split(/\s+/);

function walk(parent: Elem, ctx: Ctx, out: Block[], depth: number): void {
  let runs: Run[] = [];
  const base = (): ParaOpts => (ctx.inCell ? { size: CELL_SIZE, bold: false, before: 0, after: 2 } : ctx.inList ? { size: BODY_SIZE, bold: false, before: 0, after: 3 } : { size: BODY_SIZE, bold: false, before: 0, after: 6 });
  const flush = () => {
    emit(runs, ctx, base(), out);
    runs = [];
  };
  parent.kids.forEach((child) => {
    if (child.t === 'text') return void inline(child, {}, runs);
    const el = child;
    const tag = el.tag;
    if (SKIP.has(tag)) return;
    if (/^h[1-6]$/.test(tag)) {
      flush();
      const lvl = Number(tag[1]);
      const rs: Run[] = [];
      inline(el, {}, rs);
      emit(rs, ctx, { size: ctx.inCell ? CELL_SIZE : HEADING_SIZE[lvl - 1]!, bold: true, before: ctx.inCell ? 0 : lvl === 1 ? 14 : 10, after: ctx.inCell ? 2 : 6, level: lvl }, out);
    } else if (tag === 'p') {
      flush();
      const rs: Run[] = [];
      el.kids.forEach((c) => inline(c, {}, rs));
      emit(rs, ctx, base(), out);
    } else if (tag === 'ul' || tag === 'ol') {
      flush();
      const ordered = tag === 'ol';
      let n = Number(el.attrs.start) || 1;
      const lctx: Ctx = { ...ctx, indent: ctx.indent + LIST_INDENT, inList: true, marker: null };
      for (const li of el.kids) {
        if (li.t !== 'el' || li.tag !== 'li') continue;
        lctx.marker = { text: listMarker(ordered, depth, n++) };
        walk(li, lctx, out, depth + 1);
        lctx.marker = null;
      }
    } else if (tag === 'li') {
      // li outside a list: treat as a block
      flush();
      walk(el, ctx, out, depth);
    } else if (tag === 'blockquote') {
      flush();
      walk(el, { ...ctx, indent: ctx.indent + QUOTE_INDENT, quote: true }, out, depth);
    } else if (tag === 'pre') {
      flush();
      const rs: Run[] = [];
      textOf(el).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').forEach((line, i) => {
        if (i > 0) rs.push({ text: '', br: true });
        if (line) rs.push({ text: cleanText(line) });
      });
      emit(rs, ctx, { ...base(), preserve: true }, out);
    } else if (tag === 'hr') {
      flush();
      out.push(classes(el).includes('pk-pagebreak') ? { type: 'break' } : { type: 'rule' });
    } else if (tag === 'table') {
      flush();
      const t = tableOf(el, depth);
      if (t.rows.length) out.push(t);
    } else if (CONTAINER.has(tag)) {
      flush();
      walk(el, tag === 'dd' ? { ...ctx, indent: ctx.indent + LIST_INDENT } : ctx, out, depth);
    } else inline(el, {}, runs);
  });
  flush();
}

/** Rows of this table, including rows in thead/tbody/tfoot, but not rows of nested tables. */
function rowsOf(el: Elem): Elem[] {
  const out: Elem[] = [];
  for (const k of el.kids) {
    if (k.t !== 'el') continue;
    if (k.tag === 'tr') out.push(k);
    else if (k.tag === 'thead' || k.tag === 'tbody' || k.tag === 'tfoot') out.push(...rowsOf(k));
  }
  return out;
}

const spanOf = (el: Elem, name: string) => Math.min(50, Math.max(1, Number(el.attrs[name]) || 1));

function tableOf(el: Elem, depth: number): Table {
  const grid: Cell[][] = [];
  // rowspan: later rows get empty placeholder cells so columns stay aligned (no vertical merge is drawn)
  const held: { col: number; span: number; rows: number }[] = [];
  for (const tr of rowsOf(el)) {
    const row: Cell[] = [];
    let col = 0;
    const fillHeld = () => {
      let h = held.find((p) => p.col === col && p.rows > 0);
      while (h) {
        row.push({ blocks: [], colspan: h.span, header: false });
        h.rows--;
        col += h.span;
        h = held.find((p) => p.col === col && p.rows > 0);
      }
    };
    for (const c of tr.kids) {
      if (c.t !== 'el' || (c.tag !== 'td' && c.tag !== 'th')) continue;
      fillHeld();
      const blocks: Block[] = [];
      walk(c, { indent: 0, quote: false, inList: false, inCell: true, marker: null }, blocks, depth);
      const colspan = spanOf(c, 'colspan');
      const rs = spanOf(c, 'rowspan');
      row.push({ blocks, colspan, header: c.tag === 'th' });
      if (rs > 1) held.push({ col, span: colspan, rows: rs - 1 });
      col += colspan;
    }
    fillHeld();
    grid.push(row);
  }
  return { type: 'table', rows: grid };
}

export function htmlToBlocks(html: string): Block[] {
  const out: Block[] = [];
  walk(parseHtml(html), { indent: 0, quote: false, inList: false, inCell: false, marker: null }, out, 0);
  return out;
}

/** Plain text: every line is its own paragraph, blank lines stay as space, spaces are kept. */
export function textToBlocks(text: string): Block[] {
  return text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map((line): Block => ({
    type: 'para', runs: line ? [{ text: cleanText(line) }] : [], size: BODY_SIZE, bold: false, indent: 0, before: 0, after: 0, quote: false, preserve: true,
  }));
}

/** Every piece of visible text in the model (used for the missing-glyph scan and verification samples). */
export function blockText(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'para') out.push(b.runs.map((r) => r.text).join('') + (b.marker ? ` ${b.marker}` : ''));
    else if (b.type === 'table') b.rows.forEach((r) => r.forEach((c) => out.push(...blockText(c.blocks))));
  }
  return out;
}
