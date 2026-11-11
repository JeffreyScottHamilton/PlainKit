import { useMemo } from 'react';
import { Button, Field } from '@/components/ui';
import { useUtilState } from '../kit';
import { searchStatus } from '../logic/http-status';
import '../utils-b.css';

export default function Util() {
  const [s, set] = useUtilState('http-status', { q: '' });
  const rows = useMemo(() => searchStatus(s.q), [s.q]);
  return (
    <div className="pk-stack">
      <p className="muted">Standard HTTP status codes. Type a number to match a code prefix, or text to match a name or meaning.</p>
      <Field label="Search codes">{(a) => <input {...a} className="pk-input" type="search" value={s.q} placeholder="404, 4, redirect, teapot" onChange={(e) => set({ q: e.target.value })} />}</Field>
      <div className="pk-row">
        <Button onClick={() => set({ q: '429' })}>Load example</Button>
        <Button onClick={() => set({ q: '' })}>Clear</Button>
      </div>
      <p className="muted" aria-live="polite">{rows.length} {rows.length === 1 ? 'code' : 'codes'} shown.</p>
      <div className="dev-scroll">
        <table className="dev-table">
          <caption className="sr-only-caption">Matching HTTP status codes</caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="mono">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.meaning}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3}>No code matches. Try a different number or word.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
