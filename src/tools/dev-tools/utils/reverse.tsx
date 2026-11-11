import { useMemo } from 'react';
import { Button, CopyButton, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { reverseGraphemes, reverseLines, reverseWords, type ReverseBy } from '../logic/reverse';

const EXAMPLE = 'one two 👨‍👩‍👧ab\nsecond line';

export default function Util() {
  const [s, set] = useUtilState('reverse', { text: '', by: 'graphemes' as ReverseBy });
  const r = useMemo(() => {
    if (s.by === 'words') return { output: reverseWords(s.text) };
    if (s.by === 'lines') return { output: reverseLines(s.text) };
    return reverseGraphemes(s.text);
  }, [s.text, s.by]);
  return (
    <div className="pk-stack">
      <p className="muted">Reverses text by user-perceived characters, by words, or by lines.</p>
      <Segmented
        label="Reverse by"
        value={s.by}
        options={[
          { value: 'graphemes', label: 'Characters' },
          { value: 'words', label: 'Words' },
          { value: 'lines', label: 'Lines' },
        ]}
        onChange={(v) => set({ by: v })}
      />
      <Panes>
        <TextIn label="Text" value={s.text} onChange={(v) => set({ text: v })} rows={8} />
        <TextOut label="Reversed" value={r.output} rows={8} />
      </Panes>
      {'note' in r && r.note && <Notice kind="warn">{r.note}</Notice>}
      <div className="pk-row">
        <CopyButton text={r.output} label="Copy reversed" />
        <Button onClick={() => set({ text: EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ text: '' })}>Clear</Button>
      </div>
    </div>
  );
}
