import { useMemo } from 'react';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { TextOut, TextIn, useUtilState } from '../kit';
import { slugify } from '../logic/slug';

export default function Util() {
  const [s, set] = useUtilState('slug', { input: '', separator: '-' as '-' | '_', maxLength: '', keepNonLatin: false });
  const max = s.maxLength.trim() === '' ? null : Number(s.maxLength);
  const r = useMemo(() => (s.input.trim() === '' ? null : slugify(s.input, { separator: s.separator, maxLength: max, keepNonLatin: s.keepNonLatin })), [s.input, s.separator, max, s.keepNonLatin]);
  return (
    <div className="pk-stack">
      <div className="pk-row">
        <Segmented<'-' | '_'>
          label="Separator"
          value={s.separator}
          options={[
            { value: '-', label: 'Hyphen (-)' },
            { value: '_', label: 'Underscore (_)' },
          ]}
          onChange={(separator) => set({ separator })}
        />
        <Field label="Max length (optional)" error={r && !r.ok && max !== null && !Number.isInteger(max) ? 'Enter a whole number.' : undefined}>
          {(a) => <input {...a} className="pk-input" type="number" min={1} max={200} step={1} value={s.maxLength} onChange={(e) => set({ maxLength: e.target.value })} />}
        </Field>
        <label className="pk-check">
          <input type="checkbox" checked={s.keepNonLatin} onChange={(e) => set({ keepNonLatin: e.target.checked })} /> Keep non-Latin letters
        </label>
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ input: 'Crème Brûlée — 2026 Guide!' })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <TextIn label="Title" rows={2} value={s.input} onChange={(input) => set({ input })} />
      {r && !r.ok && <Notice kind="warn">{r.message}</Notice>}
      <TextOut label="Slug" rows={2} value={r?.ok ? r.slug : ''} />
    </div>
  );
}
