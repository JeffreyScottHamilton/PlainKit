import { useMemo } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { CopyButton } from '@/components/ui';
import { useUtilState } from '../kit';
import { formatInBase, parseInBase } from '../logic/number-base';
import '../utils-a.css';

export default function Util() {
  const [s, set] = useUtilState('number-base', { input: '', base: '10' });
  const base = Number(s.base);
  const baseOk = Number.isInteger(base) && base >= 2 && base <= 36;
  const r = useMemo(() => (s.input.trim() === '' || !baseOk ? null : parseInBase(s.input, base)), [s.input, base, baseOk]);
  const rows: [string, string][] = r?.ok
    ? [
        ['Binary (2)', formatInBase(r.value, 2)],
        ['Octal (8)', formatInBase(r.value, 8)],
        ['Decimal (10)', formatInBase(r.value, 10)],
        ['Hexadecimal (16)', formatInBase(r.value, 16).toUpperCase()],
        [`Base ${base}`, formatInBase(r.value, base)],
      ]
    : [];
  return (
    <div className="pk-stack">
      <p className="muted">Exact for any size (BigInt), so values above 2^53 stay correct. Prefixes 0b, 0o, and 0x are accepted in their own base.</p>
      <div className="pk-row">
        <Field label="Input base (2-36)" error={baseOk ? undefined : 'Base must be a whole number from 2 to 36.'}>
          {(a) => <input {...a} className="pk-input" type="number" min={2} max={36} step={1} value={s.base} onChange={(e) => set({ base: e.target.value })} />}
        </Field>
        <Field label="Number" error={r && !r.ok ? r.message : undefined}>
          {(a) => <input {...a} className="pk-input mono" value={s.input} spellCheck={false} onChange={(e) => set({ input: e.target.value })} />}
        </Field>
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ input: '9007199254740993', base: '10' })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      {r?.ok && (
        <>
          <dl className="dev-kv">
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd className="mono">
                  {v} <CopyButton text={v} />
                </dd>
              </div>
            ))}
            <dt>Bit length</dt>
            <dd className="mono">{r.bits}</dd>
          </dl>
        </>
      )}
      {!r && baseOk && s.input.trim() === '' && <Notice kind="info">Enter a number in base {base}.</Notice>}
    </div>
  );
}
