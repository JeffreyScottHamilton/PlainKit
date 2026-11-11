export type Width = 2 | 4 | 8;

/** Expands tabs to the next tab stop. leadingOnly limits the change to indentation. */
export function tabsToSpaces(text: string, width: Width, leadingOnly: boolean): { output: string; tabs: number } {
  let tabs = 0;
  const output = text
    .split('\n')
    .map((line) => {
      const indentLen = /^[ \t]*/.exec(line)![0].length;
      const head = leadingOnly ? line.slice(0, indentLen) : line;
      const tail = leadingOnly ? line.slice(indentLen) : '';
      let col = 0;
      let out = '';
      for (const ch of head) {
        if (ch === '\t') {
          tabs++;
          const n = width - (col % width);
          out += ' '.repeat(n);
          col += n;
        } else {
          out += ch;
          col++;
        }
      }
      return out + tail;
    })
    .join('\n');
  return { output, tabs };
}

/** Rewrites runs of spaces that cross a tab stop as tabs. Leading only by default. */
export function spacesToTabs(text: string, width: Width, leadingOnly: boolean): { output: string; changedLines: number } {
  let changedLines = 0;
  const output = text
    .split('\n')
    .map((line) => {
      const re = leadingOnly ? /^[ \t]+/ : / +/g;
      let changed = false;
      const replaced = line.replace(re, (run: string, offset: number) => {
        let col = 0;
        for (let i = 0; i < offset; i++) col += line[i] === '\t' ? width - (col % width) : 1;
        const start = col;
        const end = start + run.length;
        // Only spaces are rewritten; a tab already in the run keeps its visual column.
        if (!leadingOnly && Math.floor(end / width) === Math.floor(start / width)) return run;
        let out = '';
        let c = start;
        while (true) {
          const next = (Math.floor(c / width) + 1) * width;
          if (next > end) break;
          out += '\t';
          c = next;
        }
        if (out === '') return run;
        out += ' '.repeat(end - c);
        changed = true;
        return out;
      });
      if (changed) changedLines++;
      return replaced;
    })
    .join('\n');
  return { output, changedLines };
}
