import { useMemo } from 'react';
import { Button } from '@/components/ui';
import { TextIn, useUtilState } from '../kit';
import { hasSegmenter, textStats } from '../logic/text-stats';

const EXAMPLE = '\u{1F468}‍\u{1F469}‍\u{1F467} é';

export default function Util() {
  const [s, set] = useUtilState('text-stats', { input: '' });
  const st = useMemo(() => textStats(s.input), [s.input]);
  const rows: [string, string][] = [
    ['UTF-16 code units (JavaScript length)', String(st.utf16)],
    ['Unicode code points', String(st.codePoints)],
    [
      'Grapheme clusters (user-perceived characters)',
      st.graphemes === null ? 'Not available: this browser has no Intl.Segmenter' : String(st.graphemes),
    ],
    ['UTF-8 bytes', String(st.utf8Bytes)],
    ['Words (runs of letters or numbers)', String(st.words)],
    ['Lines', String(st.lines)],
    ['Paragraphs (separated by blank lines)', String(st.paragraphs)],
  ];
  return (
    <div className="pk-stack">
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <TextIn label="Text" rows={6} value={s.input} onChange={(input) => set({ input })} />
      <dl className="dev-kv">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd className="mono">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        {hasSegmenter() ? 'Grapheme clusters use Intl.Segmenter.' : ''} Words do not segment CJK text, so a run of CJK characters counts as one word.
      </p>
    </div>
  );
}
