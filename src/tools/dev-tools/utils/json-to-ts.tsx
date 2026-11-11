import { useMemo } from 'react';
import { Button, Field } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { jsonToTs } from '../logic/json-to-ts';

const EXAMPLE = JSON.stringify(
  { id: 1, name: 'Ada', tags: ['admin'], address: { city: 'Leeds', zip: null }, orders: [{ sku: 'A-1', qty: 2 }, { sku: 'B-2', qty: 1, note: 'gift' }], 'display-name': 'Ada L.' },
  null,
  2,
);

export default function Util() {
  const [s, set] = useUtilState('json-to-ts', { input: '', root: 'Root' });
  const r = useMemo(() => (s.input.trim() === '' ? null : jsonToTs(s.input, s.root)), [s.input, s.root]);
  return (
    <div className="pk-stack">
      <p className="muted">Infers interfaces from a sample. Keys missing from some array items become optional; invalid identifiers are quoted.</p>
      <div className="pk-row">
        <Field label="Root name">{(a) => <input {...a} className="pk-input mono" value={s.root} spellCheck={false} onChange={(e) => set({ root: e.target.value })} />}</Field>
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <Panes>
        <TextIn label="JSON sample" rows={12} value={s.input} onChange={(input) => set({ input })} error={r && !r.ok ? r.message : undefined} />
        <TextOut label="TypeScript" rows={12} value={r?.ok ? r.text : ''} />
      </Panes>
    </div>
  );
}
