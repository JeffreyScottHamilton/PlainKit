import { diffLines } from 'diff';

export type DiffRow = { kind: 'same' | 'added' | 'removed'; prefix: '  ' | '+ ' | '- '; text: string };
export type DiffResult = { rows: DiffRow[]; added: number; removed: number; same: number };

function splitLines(value: string): string[] {
  if (value === '') return [];
  const lines = value.split('\n');
  if (value.endsWith('\n')) lines.pop();
  return lines;
}

export function lineDiff(a: string, b: string, ignoreWhitespace: boolean): DiffResult {
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let same = 0;
  for (const part of diffLines(a, b, { ignoreWhitespace })) {
    const kind: DiffRow['kind'] = part.added ? 'added' : part.removed ? 'removed' : 'same';
    const prefix: DiffRow['prefix'] = kind === 'added' ? '+ ' : kind === 'removed' ? '- ' : '  ';
    for (const text of splitLines(part.value)) {
      rows.push({ kind, prefix, text });
      if (kind === 'added') added++;
      else if (kind === 'removed') removed++;
      else same++;
    }
  }
  return { rows, added, removed, same };
}
