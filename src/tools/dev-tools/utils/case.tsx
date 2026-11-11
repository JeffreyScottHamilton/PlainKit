import { useMemo } from 'react';
import { Button, CopyButton } from '@/components/ui';
import { TextIn, useUtilState } from '../kit';
import { CASE_STYLES, convertCase } from '../logic/case';

export default function Util() {
  const [s, set] = useUtilState('case', { input: '' });
  const rows = useMemo(() => CASE_STYLES.map((st) => ({ ...st, value: convertCase(s.input, st.value) })), [s.input]);
  return (
    <div className="pk-stack">
      <p className="muted">Words split on spaces, _, -, punctuation, letter/digit changes, and acronym boundaries (HTTPServer becomes HTTP and Server).</p>
      <div className="pk-row">
        <Button onClick={() => set({ input: 'HTTPServer_error-code' })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <TextIn label="Text" rows={3} value={s.input} onChange={(input) => set({ input })} />
      <ul className="dev-list">
        {rows.map((r) => (
          <li key={r.value + r.label} className="dev-row-item">
            <span style={{ minWidth: 150 }}>{r.label}</span>
            <span className="mono">{r.value}</span>
            <CopyButton text={r.value} />
          </li>
        ))}
      </ul>
    </div>
  );
}
