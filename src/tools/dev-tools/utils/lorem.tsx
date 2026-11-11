import { useMemo } from 'react';
import { Button, Field, Segmented } from '@/components/ui';
import { TextOut, useUtilState } from '../kit';
import { generateLorem, type LoremUnit } from '../logic/lorem';

export default function Util() {
  const [s, set] = useUtilState('lorem', { unit: 'paragraphs' as LoremUnit, count: '3', startWithLorem: true });
  const r = useMemo(() => generateLorem(s.unit, Number(s.count), s.startWithLorem), [s.unit, s.count, s.startWithLorem]);
  return (
    <div className="pk-stack">
      <div className="pk-row">
        <Segmented<LoremUnit>
          label="Unit"
          value={s.unit}
          options={[
            { value: 'paragraphs', label: 'Paragraphs' },
            { value: 'sentences', label: 'Sentences' },
            { value: 'words', label: 'Words' },
          ]}
          onChange={(unit) => set({ unit })}
        />
        <Field label="Count" error={r.ok ? undefined : r.message}>
          {(a) => <input {...a} className="pk-input" type="number" min={1} step={1} value={s.count} onChange={(e) => set({ count: e.target.value })} />}
        </Field>
        <label className="pk-check">
          <input type="checkbox" checked={s.startWithLorem} onChange={(e) => set({ startWithLorem: e.target.checked })} /> Start with &ldquo;Lorem ipsum&rdquo;
        </label>
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ unit: 'paragraphs', count: '2', startWithLorem: true })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ count: '' })}>Clear</Button>
      </div>
      <TextOut label="Placeholder text" rows={12} value={r.ok ? r.text : ''} />
    </div>
  );
}
