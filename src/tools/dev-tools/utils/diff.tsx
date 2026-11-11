import { useMemo } from 'react';
import { Button } from '@/components/ui';
import { TextIn, useUtilState } from '../kit';
import { lineDiff } from '../logic/diff';
import '../utils-a.css';

export default function Util() {
  const [s, set] = useUtilState('diff', { a: '', b: '', ignoreWhitespace: false });
  const d = useMemo(() => lineDiff(s.a, s.b, s.ignoreWhitespace), [s.a, s.b, s.ignoreWhitespace]);
  const empty = s.a === '' && s.b === '';
  return (
    <div className="pk-stack">
      <label className="pk-check">
        <input type="checkbox" checked={s.ignoreWhitespace} onChange={(e) => set({ ignoreWhitespace: e.target.checked })} /> Ignore whitespace differences
      </label>
      <div className="pk-row">
        <Button
          onClick={() =>
            set({ a: 'The quick brown fox\njumps over\nthe lazy dog\n', b: 'The quick red fox\njumps over\nthe lazy dog\nand runs away\n' })
          }
        >
          Load example
        </Button>
        <Button variant="ghost" onClick={() => set({ a: '', b: '' })}>Clear</Button>
      </div>
      <div className="pk-row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <TextIn label="Original" rows={8} value={s.a} onChange={(a) => set({ a })} />
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <TextIn label="Changed" rows={8} value={s.b} onChange={(b) => set({ b })} />
        </div>
      </div>
      {!empty && (
        <>
          <p aria-live="polite">
            <strong className="dev-add">+{d.added} added</strong>, <strong className="dev-del">-{d.removed} removed</strong>, {d.same} unchanged
          </p>
          <div className="dev-lines" role="region" aria-label="Line diff" tabIndex={0}>
            {d.rows.map((row, i) => (
              <div key={i} className={row.kind === 'added' ? 'dev-add' : row.kind === 'removed' ? 'dev-del' : undefined}>
                {row.prefix}
                {row.text}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
