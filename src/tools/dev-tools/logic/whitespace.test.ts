import { describe, expect, it } from 'vitest';
import { cleanWhitespace, type WsOptions } from './whitespace';

const off: WsOptions = { trimLineEnds: false, collapseSpaces: false, collapseBlankLines: false, trimDocStart: false, trimDocEnd: false, eol: 'keep', nbspToSpace: false };

describe('whitespace cleanup', () => {
  it('trims line ends, collapses spaces and blank lines, and counts changes', () => {
    const r = cleanWhitespace('a  b   \n\n\n  c\t\n', { ...off, trimLineEnds: true, collapseSpaces: true, collapseBlankLines: true });
    expect(r.output).toBe('a b\n\n  c\n');
    expect(r.counts).toEqual({ lineEndsTrimmed: 2, spaceRunsCollapsed: 2, blankLinesRemoved: 1, eolChanged: 0, nbspReplaced: 0 });
  });

  it('normalizes line endings to CRLF and counts the changed ones', () => {
    const r = cleanWhitespace('a\nb\r\nc', { ...off, eol: 'crlf' });
    expect(r.output).toBe('a\r\nb\r\nc');
    expect(r.counts.eolChanged).toBe(1);
  });

  it('leaves non-breaking spaces alone unless opted in', () => {
    const src = 'a  b';
    expect(cleanWhitespace(src, { ...off, collapseSpaces: true }).output).toBe(src);
    const opt = cleanWhitespace(src, { ...off, nbspToSpace: true, collapseSpaces: true });
    expect(opt.output).toBe('a b');
    expect(opt.counts.nbspReplaced).toBe(2);
  });
});
