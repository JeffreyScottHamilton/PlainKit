import { Button, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { escapeText, unescapeText, type EscapeMode } from '../logic/escape';

const EXAMPLES: Record<EscapeMode, string> = {
  json: 'He said "hi"\nC:\\temp',
  js: "It's a tab:\there",
  regex: 'price is $5 (approx.)',
};
const MODES: { value: EscapeMode; label: string }[] = [
  { value: 'json', label: 'JSON string' },
  { value: 'js', label: 'JavaScript string' },
  { value: 'regex', label: 'Regex literal' },
];

export default function Util() {
  const [s, set] = useUtilState('escape', { mode: 'json' as EscapeMode, dir: 'escape' as 'escape' | 'unescape', input: '' });
  const r = s.dir === 'escape' ? { ok: true as const, value: escapeText(s.mode, s.input) } : unescapeText(s.mode, s.input);
  return (
    <div className="pk-stack">
      <p className="muted">Escapes or unescapes text for a JSON string, a JavaScript string, or a regex literal. Input is never evaluated.</p>
      <div className="pk-row">
        <Segmented label="Escape type" value={s.mode} options={MODES} onChange={(v) => set({ mode: v })} />
        <Segmented
          label="Direction"
          value={s.dir}
          options={[
            { value: 'escape', label: 'Escape' },
            { value: 'unescape', label: 'Unescape' },
          ]}
          onChange={(v) => set({ dir: v })}
        />
      </div>
      <Panes>
        <TextIn label={s.dir === 'escape' ? 'Plain text' : 'Escaped text'} value={s.input} onChange={(v) => set({ input: v })} rows={8} error={r.ok ? undefined : r.error} />
        <TextOut label={s.dir === 'escape' ? 'Escaped' : 'Unescaped'} value={r.ok ? r.value : ''} />
      </Panes>
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLES[s.mode] })}>Load example</Button>
        <Button onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      {!r.ok && <Notice kind="error">{r.error} Fix the input, or switch to Escape.</Notice>}
    </div>
  );
}
