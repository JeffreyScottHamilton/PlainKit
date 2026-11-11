import { useMemo } from 'react';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { TextOut, useUtilState } from '../kit';
import { formatUuid, uuidV4, uuidV7, validCount } from '../logic/uuid';

export default function Util() {
  const [s, set] = useUtilState('uuid', { version: '4' as '4' | '7', count: '5', upper: false, hyphens: true, seed: 0 });
  const n = Number(s.count);
  const valid = s.count.trim() !== '' && validCount(n);
  // seed bumps "Generate again"; the ids are not kept anywhere else
  const ids = useMemo(() => {
    if (!valid) return [];
    const now = Date.now();
    return Array.from({ length: n }, () => formatUuid(s.version === '4' ? uuidV4() : uuidV7(now), s.upper, s.hyphens));
  }, [valid, n, s.version, s.upper, s.hyphens, s.seed]);
  return (
    <div className="pk-stack">
      <div className="pk-row">
        <Segmented<'4' | '7'>
          label="UUID version"
          value={s.version}
          options={[
            { value: '4', label: 'v4 (random)' },
            { value: '7', label: 'v7 (time-ordered)' },
          ]}
          onChange={(version) => set({ version })}
        />
        <Field label="Count (1-100)" error={s.count.trim() !== '' && !valid ? 'Enter a whole number from 1 to 100.' : undefined}>
          {(a) => <input {...a} className="pk-input" type="number" min={1} max={100} step={1} value={s.count} onChange={(e) => set({ count: e.target.value })} />}
        </Field>
      </div>
      <div className="pk-row">
        <label className="pk-check">
          <input type="checkbox" checked={s.upper} onChange={(e) => set({ upper: e.target.checked })} /> Uppercase
        </label>
        <label className="pk-check">
          <input type="checkbox" checked={s.hyphens} onChange={(e) => set({ hyphens: e.target.checked })} /> Hyphens
        </label>
      </div>
      <div className="pk-row">
        <Button variant="primary" onClick={() => set((c) => ({ ...c, seed: c.seed + 1 }))}>Generate again</Button>
        <Button onClick={() => set({ version: '7', count: '3' })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ count: '' })}>Clear</Button>
      </div>
      <TextOut label="Generated UUIDs" rows={Math.min(Math.max(ids.length, 3), 12)} value={ids.join('\n')} />
      <Notice kind="info">v4 uses crypto.randomUUID. v7 puts a millisecond timestamp in the first 48 bits and random bits after it.</Notice>
    </div>
  );
}
