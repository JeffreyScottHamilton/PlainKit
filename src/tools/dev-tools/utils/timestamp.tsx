import { useMemo } from 'react';
import { Button, CopyButton, Notice, Segmented } from '@/components/ui';
import { TextIn, useUtilState } from '../kit';
import { isoToMs, localIso, parseTimestamp, type TsUnit } from '../logic/timestamp';
import '../utils-a.css';

export default function Util() {
  const [s, set] = useUtilState('timestamp', { input: '', unit: 'auto' as TsUnit });
  const r = useMemo(() => (s.input.trim() === '' ? null : parseTimestamp(s.input, s.unit)), [s.input, s.unit]);
  const rows = r?.ok
    ? [
        ['Unix seconds', String(Math.floor(r.ms / 1000))],
        ['Unix milliseconds', String(Math.round(r.ms))],
        ['ISO 8601 (UTC)', new Date(r.ms).toISOString()],
        ['Local time', localIso(r.ms)],
      ]
    : [];
  return (
    <div className="pk-stack">
      <div className="pk-row">
        <Segmented<TsUnit>
          label="Unit for numbers"
          value={s.unit}
          options={[
            { value: 'auto', label: 'Auto-detect' },
            { value: 'seconds', label: 'Seconds' },
            { value: 'milliseconds', label: 'Milliseconds' },
          ]}
          onChange={(unit) => set({ unit })}
        />
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ input: String(Math.floor(Date.now() / 1000)), unit: 'seconds' })}>Now</Button>
        <Button onClick={() => set({ input: '2026-01-01T12:00:00Z', unit: 'auto' })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <TextIn
        label="Unix time or ISO 8601 date"
        rows={2}
        value={s.input}
        onChange={(input) => set({ input })}
        error={r && !r.ok ? r.message : undefined}
        hint="Dates without a zone are read as local time; date-only values are read as UTC."
      />
      {r?.ok && (
        <>
          <Notice kind="info">{r.assumed}</Notice>
          <dl className="dev-kv">
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd className="mono">
                  {v} <CopyButton text={v} label="Copy" />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
