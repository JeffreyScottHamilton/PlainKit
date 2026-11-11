import { useMemo } from 'react';
import { Button, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import '../utils-b.css';
import { codePointRows, fromEscapes, toEscapes } from '../logic/unicode';

const ROW_CAP = 500;
const EXAMPLE = 'a é 😀 👨‍👩‍👧 ​';
const hex = (n: number) => `U+${n.toString(16).toUpperCase().padStart(4, '0')}`;

export default function Util() {
  const [s, set] = useUtilState('unicode', { text: '', style: 'u4' as 'u4' | 'brace', scope: 'non-ascii' as 'non-ascii' | 'all', esc: '' });
  const rows = useMemo(() => codePointRows(s.text), [s.text]);
  const escaped = useMemo(() => toEscapes(s.text, s.style, s.scope), [s.text, s.style, s.scope]);
  const decoded = useMemo(() => (s.esc ? fromEscapes(s.esc) : null), [s.esc]);
  return (
    <div className="pk-stack">
      <p className="muted">
        Rows are code points, not user-perceived characters. One emoji with a joiner can be several rows.
      </p>
      <TextIn label="Text" value={s.text} onChange={(v) => set({ text: v })} rows={3} />
      <div className="pk-row">
        <Button onClick={() => set({ text: EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ text: '', esc: '' })}>Clear</Button>
      </div>
      <h3>Code points ({rows.length})</h3>
      <div className="dev-scroll">
        <table className="dev-table">
          <thead>
            <tr>
              <th scope="col">Char</th>
              <th scope="col">Code point</th>
              <th scope="col">Name</th>
              <th scope="col">UTF-8 bytes</th>
              <th scope="col">UTF-16 units</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, ROW_CAP).map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.cp < 0x20 || (r.cp >= 0x7f && r.cp <= 0x9f) ? '·' : r.char}</td>
                <td className="mono">{hex(r.cp)}</td>
                <td>{r.name}</td>
                <td className="mono">{r.utf8.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}</td>
                <td className="mono">{r.utf16Units.map((u) => hex(u)).join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > ROW_CAP && <Notice kind="info">Showing the first {ROW_CAP} of {rows.length} code points.</Notice>}
      <div className="pk-row">
        <Segmented
          label="Escape style"
          value={s.style}
          options={[
            { value: 'u4', label: '\\uXXXX' },
            { value: 'brace', label: '\\u{X}' },
          ]}
          onChange={(v) => set({ style: v })}
        />
        <Segmented
          label="Escape scope"
          value={s.scope}
          options={[
            { value: 'non-ascii', label: 'Non-ASCII only' },
            { value: 'all', label: 'Everything' },
          ]}
          onChange={(v) => set({ scope: v })}
        />
      </div>
      <Panes>
        <TextOut label="Escaped" value={escaped} rows={5} />
        <TextIn label="Escapes to decode" value={s.esc} onChange={(v) => set({ esc: v })} rows={5} error={decoded && !decoded.ok ? decoded.error : undefined} />
      </Panes>
      {decoded?.ok && <TextOut label="Decoded" value={decoded.value} rows={3} />}
    </div>
  );
}
