import { useMemo } from 'react';
import { Button, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../logic/base64';

const EXAMPLE = 'Plainkit 👋 héllo, 日本語';

export default function Util() {
  const [s, set] = useUtilState('base64', { input: '', mode: 'encode' as 'encode' | 'decode', urlSafe: false });
  const r = useMemo(() => {
    if (s.mode === 'encode') return { ok: true as const, text: encodeBase64Utf8(s.input, s.urlSafe) };
    return s.input.trim() === '' ? { ok: true as const, text: '' } : decodeBase64Utf8(s.input);
  }, [s.input, s.mode, s.urlSafe]);
  return (
    <div className="pk-stack">
      <p className="muted">Text is encoded as UTF-8 first, so emoji and non-Latin text round-trip.</p>
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
        <label className="pk-check">
          <input type="checkbox" checked={s.urlSafe} onChange={(e) => set({ urlSafe: e.target.checked })} /> URL-safe alphabet (- and _, no padding)
        </label>
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <Panes>
        <TextIn
          label={s.mode === 'encode' ? 'Text to encode' : 'Base64 to decode'}
          hint="Decoding accepts both alphabets and whitespace."
          value={s.input}
          onChange={(input) => set({ input })}
          error={!r.ok ? r.message : undefined}
        />
        <TextOut label={s.mode === 'encode' ? 'Base64' : 'Text'} value={r.ok ? r.text : ''} />
      </Panes>
    </div>
  );
}
