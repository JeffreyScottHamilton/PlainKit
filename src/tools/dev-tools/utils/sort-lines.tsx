import { useMemo } from 'react';
import { Button, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { sortLines, type SortOptions } from '../logic/sort-lines';

const EXAMPLE = 'item10\nitem2\nItem1\n\nitem2\nalpha\nBeta';

const CHECKS: { key: Exclude<keyof SortOptions, 'order'>; label: string }[] = [
  { key: 'caseInsensitive', label: 'Ignore case' },
  { key: 'natural', label: 'Natural numbers (item2 before item10)' },
  { key: 'unique', label: 'Remove duplicates' },
  { key: 'removeEmpty', label: 'Remove empty lines' },
  { key: 'reverse', label: 'Reverse the result' },
  { key: 'shuffle', label: 'Shuffle (random order)' },
];

export default function Util() {
  const [s, set] = useUtilState('sort-lines', {
    text: '',
    order: 'asc' as SortOptions['order'],
    caseInsensitive: true,
    natural: true,
    unique: false,
    removeEmpty: false,
    reverse: false,
    shuffle: false,
    seed: 0,
  });
  const opts: SortOptions = { order: s.order, caseInsensitive: s.caseInsensitive, natural: s.natural, unique: s.unique, removeEmpty: s.removeEmpty, reverse: s.reverse, shuffle: s.shuffle };
  // seed changes only from "Shuffle again", so the shuffle is re-drawn on demand.
  const result = useMemo(() => sortLines(s.text, opts), [s.text, s.order, s.caseInsensitive, s.natural, s.unique, s.removeEmpty, s.reverse, s.shuffle, s.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pk-stack">
      <p className="muted">Sorts, dedupes, and reorders lines. Shuffle uses the browser's secure random source.</p>
      <Segmented
        label="Order"
        value={s.order}
        options={[
          { value: 'asc', label: 'A to Z' },
          { value: 'desc', label: 'Z to A' },
          { value: 'keep', label: 'Keep order' },
        ]}
        onChange={(v) => set({ order: v })}
      />
      <fieldset className="pk-row" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="pk-label">Options</legend>
        {CHECKS.map((c) => (
          <label key={c.key} className="pk-check">
            <input type="checkbox" checked={s[c.key]} onChange={(e) => set({ [c.key]: e.target.checked })} />
            {c.label}
          </label>
        ))}
      </fieldset>
      <Panes>
        <TextIn label="Lines" value={s.text} onChange={(v) => set({ text: v })} rows={10} />
        <TextOut label="Result" value={result.output} rows={10} />
      </Panes>
      <p className="muted" aria-live="polite">
        {result.inCount} lines in, {result.outCount} lines out.
      </p>
      <div className="pk-row">
        <Button onClick={() => set({ text: EXAMPLE })}>Load example</Button>
        {s.shuffle && <Button onClick={() => set({ seed: s.seed + 1 })}>Shuffle again</Button>}
        <Button onClick={() => set({ text: '' })}>Clear</Button>
      </div>
    </div>
  );
}
