// Block model -> plain text and Markdown. Pictures are not carried into text or Markdown; the caller is told.
import type { Block, Para, Run } from './blocks';

const runText = (r: Run): string => (r.br ? '\n' : r.text);

function paraLines(p: Para): string[] {
  const text = p.runs.map(runText).join('');
  return text.split('\n');
}

function textLines(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'para') {
      const lines = paraLines(b);
      if (b.marker) out.push(`${b.marker} ${lines[0] ?? ''}`, ...lines.slice(1));
      else out.push(...lines);
      if (!b.preserve && !b.marker) out.push('');
    } else if (b.type === 'table') {
      for (const row of b.rows) out.push(row.map((c) => textLines(c.blocks).join(' ').trim()).join('\t'));
      out.push('');
    } else if (b.type === 'rule') out.push('', '');
  }
  return out;
}

/** Plain text: one line per line of text, lists keep their marker, table cells are separated by tabs. */
export function blocksToText(blocks: Block[]): string {
  const lines = textLines(blocks);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

const MD_SPECIAL = /([\\`*_[\]])/g;
const wrap = (text: string, mark: string): string => {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : text;
};

function inlineMd(p: Para): string {
  return p.runs
    .map((r) => {
      if (r.br) return '  \n';
      let t = r.text.replace(MD_SPECIAL, '\\$1');
      if (r.bold) t = wrap(t, '**');
      if (r.italic) t = wrap(t, '*');
      if (r.href) t = `[${t.trim()}](${r.href})`;
      return t;
    })
    .join('')
    .trim();
}

/** Markdown with headings, bold, italic, links, lists, quotes, rules and pipe tables. Pictures are left out. */
export function blocksToMarkdown(blocks: Block[]): { text: string; pictures: number } {
  let pictures = 0;
  const chunks: string[] = [];
  const cellMd = (c: Block[]): string => mdBlocks(c).join(' ').replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
  const mdBlocks = (bs: Block[]): string[] => {
    const out: string[] = [];
    for (const b of bs) {
      if (b.type === 'para') {
        let body = b.preserve ? b.runs.map(runText).join('').split('\n').map((l) => `    ${l}`).join('\n') : inlineMd(b);
        if (!body) continue;
        if (b.level && !b.marker) body = `${'#'.repeat(b.level)} ${body}`;
        if (b.marker) {
          const depth = Math.max(0, Math.round(b.indent / 22) - 1);
          const bullet = b.marker.endsWith('.') ? b.marker : '-';
          body = `${'  '.repeat(depth)}${bullet} ${body}`;
        }
        if (b.quote) body = body.split('\n').map((l) => `> ${l}`).join('\n');
        out.push(body);
      } else if (b.type === 'rule') out.push('---');
      else if (b.type === 'image') pictures++;
      else if (b.type === 'table') {
        const rows = b.rows.map((r) => r.map((c) => cellMd(c.blocks)));
        if (rows.length) {
          const width = Math.max(1, ...rows.map((r) => r.length));
          const fill = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
          const line = (r: string[]) => `| ${fill(r).join(' | ')} |`;
          const [head = [], ...rest] = rows;
          out.push([line(head), `| ${Array(width).fill('---').join(' | ')} |`, ...rest.map(line)].join('\n'));
        }
      }
    }
    return out;
  };
  chunks.push(...mdBlocks(blocks));
  return { text: chunks.join('\n\n') + '\n', pictures };
}
