// Block model -> boxes (lines, images, rules, table rows) using a font-metrics interface, then pagination. Pure: no pdf-lib here.
import type { Block, Cell, Para, Run } from './blocks';


export type FontStyle = { bold: boolean; italic: boolean };
export interface Metrics {
  width(text: string, style: FontStyle, size: number): number;
}
export type Piece = { text: string; x: number; w: number; bold: boolean; italic: boolean; underline: boolean; strike: boolean; href?: string };
export type PreparedImage = { key: string; width: number; height: number };

type Common = { height: number; before: number; after: number };
export type LineBox = Common & { kind: 'line'; x: number; size: number; pieces: Piece[]; marker?: { text: string; x: number }; bar?: number; bold: boolean };
export type ImageBox = Common & { kind: 'image'; x: number; width: number; image: PreparedImage };
export type RuleBox = Common & { kind: 'rule'; x: number; width: number };
export type BreakBox = Common & { kind: 'break' };
export type RowCell = { x: number; w: number; boxes: Box[]; header: boolean };
export type RowBox = Common & { kind: 'row'; x: number; width: number; cells: RowCell[] };
export type Box = LineBox | ImageBox | RuleBox | BreakBox | RowBox;

export type LayoutCtx = { metrics: Metrics; images: Map<string, PreparedImage>; maxImageHeight: number };

export const LINE_HEIGHT = 1.4;
export const CELL_PAD = 4;

// ---------- line breaking ----------
type Tok = { text: string; space: boolean; run: Run };
type Line = { toks: Tok[]; width: number };

const tokenize = (runs: Run[]): (Tok | 'br')[] => {
  const out: (Tok | 'br')[] = [];
  for (const run of runs) {
    if (run.br) out.push('br');
    else for (const m of run.text.matchAll(/\s+|\S+/g)) out.push({ text: m[0], space: /^\s/.test(m[0]), run });
  }
  return out;
};

/** Greedy wrap. Spaces never force a break; a word wider than the line is split by character. */
export function wrapRuns(runs: Run[], maxWidth: number, size: number, metrics: Metrics, forceBold = false, preserve = false): Line[] {
  const lines: Line[] = [];
  let cur: Line = { toks: [], width: 0 };
  const w = (t: string, r: Run) => metrics.width(t, { bold: forceBold || !!r.bold, italic: !!r.italic }, size);
  const trim = (l: Line) => {
    while (l.toks.length && l.toks[l.toks.length - 1]!.space) {
      const t = l.toks.pop()!;
      l.width -= w(t.text, t.run);
    }
  };
  const push = () => {
    trim(cur);
    lines.push(cur);
    cur = { toks: [], width: 0 };
  };
  let afterBr = false;
  const hasWord = () => cur.toks.some((t) => !t.space);
  for (const t of tokenize(runs)) {
    if (t === 'br') {
      push();
      afterBr = true;
      continue;
    }
    const tw = w(t.text, t.run);
    const wasAfterBr = afterBr;
    afterBr = false;
    if (t.space) {
      if (cur.toks.length === 0 && !(preserve && (lines.length === 0 || wasAfterBr))) continue;
      cur.toks.push(t);
      cur.width += tw;
      continue;
    }
    if (cur.width + tw <= maxWidth) {
      cur.toks.push(t);
      cur.width += tw;
      continue;
    }
    if (hasWord()) push();
    else if (cur.toks.length) cur = { toks: [], width: 0 };
    if (tw <= maxWidth) {
      cur.toks.push(t);
      cur.width += tw;
      continue;
    }
    let piece = '';
    for (const ch of Array.from(t.text)) {
      if (piece && w(piece + ch, t.run) > maxWidth) {
        cur.toks.push({ ...t, text: piece });
        cur.width += w(piece, t.run);
        push();
        piece = '';
      }
      piece += ch;
    }
    if (piece) {
      cur.toks.push({ ...t, text: piece });
      cur.width += w(piece, t.run);
    }
  }
  push();
  return lines;
}

function toPieces(line: Line, size: number, metrics: Metrics, forceBold: boolean): Piece[] {
  const pieces: Piece[] = [];
  let x = 0;
  for (const t of line.toks) {
    const r = t.run;
    const bold = forceBold || !!r.bold;
    const italic = !!r.italic;
    const w = metrics.width(t.text, { bold, italic }, size);
    const last = pieces[pieces.length - 1];
    if (last && last.bold === bold && last.italic === italic && last.underline === !!r.underline && last.strike === !!r.strike && last.href === r.href) {
      last.text += t.text;
      last.w += w;
    } else pieces.push({ text: t.text, x, w, bold, italic, underline: !!r.underline, strike: !!r.strike, href: r.href });
    x += w;
  }
  return pieces;
}

// ---------- blocks -> boxes ----------
const stackHeight = (boxes: Box[]): number => {
  let h = 0;
  boxes.forEach((b, i) => {
    h += b.height + (i > 0 ? Math.max(boxes[i - 1]!.after, b.before) : 0);
  });
  return h;
};

function layoutPara(p: Para, width: number, ctx: LayoutCtx): LineBox[] {
  const avail = Math.max(10, width - p.indent);
  const lines = wrapRuns(p.runs, avail, p.size, ctx.metrics, p.bold, p.preserve);
  return lines.map((l, i): LineBox => {
    const marker = i === 0 && p.marker ? { text: p.marker, x: p.indent - ctx.metrics.width(p.marker, { bold: false, italic: false }, p.size) - 5 } : undefined;
    return { kind: 'line', x: p.indent, size: p.size, pieces: toPieces(l, p.size, ctx.metrics, p.bold), marker, bar: p.quote ? p.indent - 10 : undefined, bold: p.bold, height: p.size * LINE_HEIGHT, before: i === 0 ? p.before : 0, after: i === lines.length - 1 ? p.after : 0 };
  });
}

/** Natural (one-line) and minimum (longest word) width of a cell's text. */
function cellWidths(c: Cell, ctx: LayoutCtx): { min: number; pref: number } {
  let min = 0;
  let pref = 0;
  for (const b of c.blocks) {
    if (b.type === 'para') {
      let line = 0;
      for (const r of b.runs) {
        const st = { bold: b.bold || !!r.bold, italic: !!r.italic };
        for (const m of r.text.matchAll(/\S+|\s+/g)) {
          const w = ctx.metrics.width(m[0], st, b.size);
          line += w;
          if (!/^\s/.test(m[0])) min = Math.max(min, Math.min(w, 120));
        }
      }
      pref = Math.max(pref, line + b.indent);
    } else if (b.type === 'image') {
      min = Math.max(min, 40);
      pref = Math.max(pref, 120);
    } else if (b.type === 'table') pref = Math.max(pref, 200);
  }
  return { min: min + 2 * CELL_PAD, pref: pref + 2 * CELL_PAD };
}

function layoutTable(rows: Cell[][], width: number, ctx: LayoutCtx): RowBox[] {
  const cols = Math.max(1, ...rows.map((r) => r.reduce((n, c) => n + c.colspan, 0)));
  const min = new Array<number>(cols).fill(2 * CELL_PAD + 6);
  const pref = new Array<number>(cols).fill(2 * CELL_PAD + 6);
  for (const r of rows) {
    let col = 0;
    for (const c of r) {
      if (c.colspan === 1) {
        const w = cellWidths(c, ctx);
        min[col] = Math.max(min[col]!, w.min);
        pref[col] = Math.max(pref[col]!, w.pref);
      }
      col += c.colspan;
    }
  }
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  let widths: number[];
  if (sum(pref) <= width) {
    // Content fits: spread the spare width in proportion to content.
    const spare = width - sum(pref);
    widths = pref.map((p) => p + (spare * p) / sum(pref));
  } else if (sum(min) >= width) widths = min.map((m) => (m * width) / sum(min));
  else {
    const extra = width - sum(min);
    const want = sum(pref) - sum(min);
    widths = min.map((m, i) => m + (extra * (pref[i]! - m)) / want);
  }
  return rows.map((r): RowBox => {
    let col = 0;
    let x = 0;
    const cells: RowCell[] = r.map((c) => {
      const w = sum(widths.slice(col, col + c.colspan));
      const boxes = layoutBlocks(c.blocks.map((b) => (c.header && b.type === 'para' ? { ...b, bold: true } : b)), w - 2 * CELL_PAD, ctx);
      const cell = { x, w, boxes, header: c.header };
      x += w;
      col += c.colspan;
      return cell;
    });
    const height = Math.max(CELL_PAD * 2 + 12, ...cells.map((c) => stackHeight(c.boxes) + 2 * CELL_PAD));
    return { kind: 'row', x: 0, width: x, cells, height, before: 0, after: 0 };
  });
}

export function layoutBlocks(blocks: Block[], width: number, ctx: LayoutCtx): Box[] {
  const out: Box[] = [];
  for (const b of blocks) {
    if (b.type === 'para') out.push(...layoutPara(b, width, ctx));
    else if (b.type === 'rule') out.push({ kind: 'rule', x: 0, width, height: 1, before: 8, after: 8 });
    else if (b.type === 'break') out.push({ kind: 'break', height: 0, before: 0, after: 0 });
    else if (b.type === 'image') {
      const im = ctx.images.get(b.src);
      if (!im) continue;
      const avail = Math.max(10, width - b.indent);
      const natW = im.width * 0.75;
      const natH = im.height * 0.75;
      const s = Math.min(1, avail / natW, ctx.maxImageHeight / natH);
      out.push({ kind: 'image', x: b.indent, width: natW * s, height: natH * s, image: im, before: 4, after: 6 });
    } else out.push(...layoutTable(b.rows, width, ctx));
  }
  return out;
}

// ---------- pagination ----------
export type Placed = { box: Box; y: number };

/** Split a row so its first part fits `avail`. Returns null for `head` when not even one box per cell fits. */
export function splitRow(row: RowBox, avail: number, force: boolean): { head: RowBox | null; tail: RowBox | null } {
  const heads: Box[][] = [];
  const tails: Box[][] = [];
  for (const c of row.cells) {
    let h = CELL_PAD;
    let n = 0;
    for (const [i, b] of c.boxes.entries()) {
      const gap = i > 0 ? Math.max(c.boxes[i - 1]!.after, b.before) : 0;
      if (h + gap + b.height + CELL_PAD > avail && !(force && n === 0)) break;
      h += gap + b.height;
      n++;
    }
    heads.push(c.boxes.slice(0, n));
    tails.push(c.boxes.slice(n));
  }
  const mk = (parts: Box[][]): RowBox => {
    const cells = row.cells.map((c, i) => ({ ...c, boxes: parts[i]! }));
    return { ...row, cells, height: Math.max(2 * CELL_PAD, ...cells.map((c) => stackHeight(c.boxes) + 2 * CELL_PAD)) };
  };
  const anyHead = heads.some((h) => h.length);
  const anyTail = tails.some((t) => t.length);
  return { head: anyHead ? mk(heads) : null, tail: anyTail ? mk(tails) : null };
}

/** Place boxes on pages of `pageHeight`. Gaps collapse to the larger of the two; rows move whole, or split by lines if taller than a page. */
export function paginate(boxes: Box[], pageHeight: number): Placed[][] {
  const pages: Placed[][] = [[]];
  let y = 0;
  let prevAfter = 0;
  const queue = [...boxes];
  const cur = () => pages[pages.length - 1]!;
  const newPage = () => {
    pages.push([]);
    y = 0;
    prevAfter = 0;
  };
  let guard = 0;
  while (queue.length) {
    if (++guard > 1_000_000) break;
    const box = queue.shift()!;
    if (box.kind === 'break') {
      if (cur().length) newPage();
      continue;
    }
    const empty = cur().length === 0;
    const gap = empty ? 0 : Math.max(prevAfter, box.before);
    if (y + gap + box.height <= pageHeight + 0.01) {
      cur().push({ box, y: y + gap });
      y += gap + box.height;
      prevAfter = box.after;
      continue;
    }
    if (box.kind === 'row' && box.height > pageHeight) {
      const { head, tail } = splitRow(box, pageHeight - y - gap, empty);
      if (head) {
        cur().push({ box: head, y: y + gap });
        if (tail) queue.unshift(tail);
        newPage();
      } else {
        newPage();
        queue.unshift(box);
      }
      continue;
    }
    if (empty) {
      cur().push({ box, y: 0 });
      y = box.height;
      prevAfter = box.after;
    } else {
      newPage();
      queue.unshift(box);
    }
  }
  return pages.length > 1 && pages[pages.length - 1]!.length === 0 ? pages.slice(0, -1) : pages;
}


// ---------- missing glyphs ----------
export type MissingReport = { count: number; examples: string[] };
/** Characters the embedded font has no glyph for. Whitespace is ignored. */
export function findMissing(texts: string[], has: (cp: number) => boolean): MissingReport {
  const seen = new Set<string>();
  let count = 0;
  for (const t of texts) {
    for (const ch of t) {
      const cp = ch.codePointAt(0)!;
      if (cp <= 0x20 || has(cp)) continue;
      count++;
      seen.add(ch);
    }
  }
  return { count, examples: [...seen].slice(0, 8) };
}
export const missingWarning = (m: MissingReport, fallback: boolean): string | null =>
  m.count === 0 ? null : fallback
    ? `${m.count} character${m.count === 1 ? '' : 's'} are outside the basic Latin set of the built-in font and were replaced by "?": ${m.examples.join(', ')}`
    : `${m.count} character${m.count === 1 ? ' is' : 's are'} not in the embedded font and appear as boxes: ${m.examples.join(', ')}`;
