import { useMemo } from 'react';
import { Button, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { cleanWhitespace, type WsOptions } from '../logic/whitespace';

const EXAMPLE = 'Title   with  spaces   \r\n\r\n\r\n\tIndented line   \n\nEnd  here  \n';

const CHECKS: { key: Exclude<keyof WsOptions, 'eol'>; label: string }[] = [
  { key: 'trimLineEnds', label: 'Trim line ends' },
  { key: 'collapseSpaces', label: 'Collapse repeated spaces inside lines' },
  { key: 'collapseBlankLines', label: 'Collapse blank lines' },
  { key: 'trimDocStart', label: 'Trim document start' },
  { key: 'trimDocEnd', label: 'Trim document end' },
  { key: 'nbspToSpace', label: 'Also turn non-breaking spaces into normal spaces (off by default)' },
];

export default function Util() {
  const [s, set] = useUtilState('whitespace', {
    text: '',
    trimLineEnds: true,
    collapseSpaces: false,
    collapseBlankLines: true,
    trimDocStart: false,
    trimDocEnd: true,
    eol: 'keep' as WsOptions['eol'],
    nbspToSpace: false,
  });
  const opts: WsOptions = { trimLineEnds: s.trimLineEnds, collapseSpaces: s.collapseSpaces, collapseBlankLines: s.collapseBlankLines, trimDocStart: s.trimDocStart, trimDocEnd: s.trimDocEnd, eol: s.eol, nbspToSpace: s.nbspToSpace };
  const r = useMemo(() => cleanWhitespace(s.text, opts), [s.text, s.trimLineEnds, s.collapseSpaces, s.collapseBlankLines, s.trimDocStart, s.trimDocEnd, s.eol, s.nbspToSpace]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = r.counts;
  return (
    <div className="pk-stack">
      <p className="muted">Cleans whitespace. Non-breaking spaces are left alone unless you turn that option on.</p>
      <fieldset className="pk-row" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="pk-label">Changes</legend>
        {CHECKS.map((ch) => (
          <label key={ch.key} className="pk-check">
            <input type="checkbox" checked={s[ch.key]} onChange={(e) => set({ [ch.key]: e.target.checked })} />
            {ch.label}
          </label>
        ))}
      </fieldset>
      <Segmented
        label="Line endings"
        value={s.eol}
        options={[
          { value: 'keep', label: 'Keep' },
          { value: 'lf', label: 'LF' },
          { value: 'crlf', label: 'CRLF' },
        ]}
        onChange={(v) => set({ eol: v })}
      />
      <Panes>
        <TextIn label="Text" value={s.text} onChange={(v) => set({ text: v })} rows={10} />
        <TextOut label="Cleaned" value={r.output} rows={10} />
      </Panes>
      <p className="muted" aria-live="polite">
        Trailing spaces removed on {c.lineEndsTrimmed} lines · space runs collapsed: {c.spaceRunsCollapsed} · blank lines removed: {c.blankLinesRemoved} · line endings changed: {c.eolChanged} · non-breaking spaces replaced: {c.nbspReplaced}
      </p>
      <div className="pk-row">
        <Button onClick={() => set({ text: EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ text: '' })}>Clear</Button>
      </div>
    </div>
  );
}
