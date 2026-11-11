export type WsOptions = {
  trimLineEnds: boolean;
  collapseSpaces: boolean;
  collapseBlankLines: boolean;
  trimDocStart: boolean;
  trimDocEnd: boolean;
  eol: 'keep' | 'lf' | 'crlf';
  nbspToSpace: boolean;
};

export type WsCounts = { lineEndsTrimmed: number; spaceRunsCollapsed: number; blankLinesRemoved: number; eolChanged: number; nbspReplaced: number };

/** Non-breaking spaces are only touched when nbspToSpace is set. */
export function cleanWhitespace(text: string, o: WsOptions): { output: string; counts: WsCounts } {
  const counts: WsCounts = { lineEndsTrimmed: 0, spaceRunsCollapsed: 0, blankLinesRemoved: 0, eolChanged: 0, nbspReplaced: 0 };
  const eols = text.match(/\r\n|\r|\n/g) ?? [];
  const sourceEol = eols.find((e) => e === '\r\n') ?? eols[0] ?? '\n';
  const targetEol = o.eol === 'keep' ? sourceEol : o.eol === 'crlf' ? '\r\n' : '\n';
  if (o.eol !== 'keep') counts.eolChanged = eols.filter((e) => e !== targetEol).length;

  let lines = text.split(/\r\n|\r|\n/);
  lines = lines.map((line) => {
    let l = line;
    if (o.nbspToSpace) {
      const n = (l.match(/ /g) ?? []).length;
      counts.nbspReplaced += n;
      l = l.replace(/ /g, ' ');
    }
    if (o.trimLineEnds) {
      const t = l.replace(/[ \t]+$/, '');
      if (t !== l) counts.lineEndsTrimmed++;
      l = t;
    }
    if (o.collapseSpaces) {
      const runs = (l.match(/(?<=\S) {2,}(?=\S)/g) ?? []).length;
      counts.spaceRunsCollapsed += runs;
      l = l.replace(/(?<=\S) {2,}(?=\S)/g, ' ');
    }
    return l;
  });

  if (o.collapseBlankLines) {
    const kept: string[] = [];
    for (const l of lines) {
      if (l.trim() === '' && kept.length > 0 && kept[kept.length - 1]!.trim() === '') {
        counts.blankLinesRemoved++;
        continue;
      }
      kept.push(l);
    }
    lines = kept;
  }

  let output = lines.join(targetEol);
  if (o.trimDocStart) output = output.replace(/^[ \t\r\n]+/, '');
  if (o.trimDocEnd) output = output.replace(/[ \t\r\n]+$/, '');
  return { output, counts };
}
