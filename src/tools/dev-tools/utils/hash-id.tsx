import { useMemo } from 'react';
import { Button, Notice } from '@/components/ui';
import { TextIn, useUtilState } from '../kit';
import { identifyHash } from '../logic/hash-id';

const EXAMPLE = 'd41d8cd98f00b204e9800998ecf8427e';

export default function Util() {
  const [s, set] = useUtilState('hash-id', { text: '' });
  const r = useMemo(() => (s.text.trim() ? identifyHash(s.text) : null), [s.text]);
  return (
    <div className="pk-stack">
      <Notice kind="warn">Heuristic guess from length and format only. It cannot confirm how a value was produced.</Notice>
      <TextIn label="Hash or hash-like string" value={s.text} onChange={(v) => set({ text: v })} rows={3} error={r && !r.ok ? r.error : undefined} />
      <div className="pk-row">
        <Button onClick={() => set({ text: EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ text: '' })}>Clear</Button>
      </div>
      {r?.ok && r.candidates.length === 0 && <Notice>No known format matched this length and character set.</Notice>}
      {r?.ok && r.candidates.length > 0 && (
        <ul>
          {r.candidates.map((c) => (
            <li key={c.name + c.detail}>
              <strong>{c.name}</strong>: {c.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
