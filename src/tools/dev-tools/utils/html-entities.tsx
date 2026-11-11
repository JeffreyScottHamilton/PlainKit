import { useMemo } from 'react';
import { Button, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { NAMED, decodeEntities, encodeEntities } from '../logic/html-entities';

const EXAMPLE = `<a href="/x?a=1&b=2">Tom & "Jerry" © 2026</a>`;

export default function Util() {
  const [s, set] = useUtilState('html-entities', { input: '', mode: 'encode' as 'encode' | 'decode', nonAscii: false });
  const decoded = useMemo(() => (s.mode === 'decode' ? decodeEntities(s.input) : null), [s.input, s.mode]);
  const output = s.mode === 'encode' ? encodeEntities(s.input, s.nonAscii) : decoded?.text ?? '';
  return (
    <div className="pk-stack">
      <p className="muted">Decoding is done by a plain-text parser. The input is never parsed as HTML.</p>
      <div className="pk-row">
        <Segmented<'encode' | 'decode'>
          label="Direction"
          value={s.mode}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
          onChange={(mode) => set({ mode })}
        />
        {s.mode === 'encode' && (
          <label className="pk-check">
            <input type="checkbox" checked={s.nonAscii} onChange={(e) => set({ nonAscii: e.target.checked })} /> Also encode non-ASCII as &amp;#N;
          </label>
        )}
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <Panes>
        <TextIn label={s.mode === 'encode' ? 'Text' : 'Text with entities'} value={s.input} onChange={(input) => set({ input })} />
        <TextOut label="Result" value={output} />
      </Panes>
      {decoded && (
        <>
          <p aria-live="polite">Decoded {decoded.decoded} reference{decoded.decoded === 1 ? '' : 's'}.</p>
          {decoded.invalid.length > 0 && <Notice kind="warn">Left unchanged (not a valid code point): {decoded.invalid.join(', ')}</Notice>}
          {decoded.unknown.length > 0 && <Notice kind="warn">Left unchanged (named entity not supported here): {decoded.unknown.join(', ')}</Notice>}
        </>
      )}
      <Notice kind="info">
        Named entities supported: {Object.keys(NAMED).join(', ')}. Numeric references (&amp;#N; and &amp;#xH;) are decoded for any valid code point. References need a trailing semicolon.
      </Notice>
    </div>
  );
}
