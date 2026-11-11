import { useMemo } from 'react';
import { Button, Field } from '@/components/ui';
import { useUtilState } from '../kit';
import { searchMime } from '../logic/mime-types';
import '../utils-b.css';

export default function Util() {
  const [s, set] = useUtilState('mime-types', { q: '' });
  const rows = useMemo(() => searchMime(s.q), [s.q]);
  return (
    <div className="pk-stack">
      <p className="muted">Common file extensions and their MIME types. Search by extension (json, .webp) or by MIME text (image/).</p>
      <Field label="Search">{(a) => <input {...a} className="pk-input" type="search" value={s.q} placeholder="pdf, image/, .json" onChange={(e) => set({ q: e.target.value })} />}</Field>
      <div className="pk-row">
        <Button onClick={() => set({ q: 'json' })}>Load example</Button>
        <Button onClick={() => set({ q: '' })}>Clear</Button>
      </div>
      <p className="muted" aria-live="polite">
        {rows.length} {rows.length === 1 ? 'match' : 'matches'}.
      </p>
      <div className="dev-scroll">
        <table className="dev-table">
          <thead>
            <tr>
              <th scope="col">Extension</th>
              <th scope="col">MIME type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.ext}-${r.mime}`}>
                <td className="mono">.{r.ext}</td>
                <td className="mono">{r.mime}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2}>No type matches. Try another extension or MIME prefix.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
