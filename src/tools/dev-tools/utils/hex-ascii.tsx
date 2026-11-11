import { useMemo } from 'react';
import { Button, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { hexToText, textToHex, type HexSep } from '../logic/hex-ascii';

const EXAMPLE_TEXT = 'Héllo';

export default function Util() {
  const [s, set] = useUtilState('hex-ascii', { dir: 'text-hex' as 'text-hex' | 'hex-text', text: '', sep: 'space' as HexSep });
  const r = useMemo(() => {
    if (!s.text.trim() && s.dir === 'hex-text') return null;
    if (s.dir === 'text-hex') return { ok: true as const, out: textToHex(s.text, s.sep), bytes: new TextEncoder().encode(s.text).length };
    const d = hexToText(s.text);
    return d.ok ? { ok: true as const, out: d.text, bytes: d.bytes } : d;
  }, [s.text, s.dir, s.sep]);
  const error = r && !r.ok ? r.error : undefined;
  return (
    <div className="pk-stack">
      <p className="muted">Converts text to UTF-8 bytes in hex, and back. Bytes that are not valid UTF-8 are rejected.</p>
      <div className="pk-row">
        <Segmented
          label="Direction"
          value={s.dir}
          options={[
            { value: 'text-hex', label: 'Text to hex' },
            { value: 'hex-text', label: 'Hex to text' },
          ]}
          onChange={(v) => set({ dir: v })}
        />
        <Segmented
          label="Separator"
          value={s.sep}
          options={[
            { value: 'space', label: 'Space' },
            { value: 'none', label: 'None' },
            { value: '0x', label: '0x prefix' },
          ]}
          onChange={(v) => set({ sep: v })}
        />
      </div>
      <Panes>
        <TextIn
          label={s.dir === 'text-hex' ? 'Text' : 'Hex bytes (spaces, commas, or 0x allowed)'}
          value={s.text}
          onChange={(v) => set({ text: v })}
          rows={8}
          error={error}
        />
        <TextOut label={s.dir === 'text-hex' ? 'Hex (UTF-8 bytes)' : 'Text decoded from UTF-8 bytes'} value={r?.ok ? r.out : ''} rows={8} />
      </Panes>
      {r?.ok && s.dir === 'text-hex' && <p className="muted">{r.bytes} UTF-8 bytes.</p>}
      {r?.ok && s.dir === 'hex-text' && <p className="muted">{r.bytes} bytes decoded.</p>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="pk-row">
        <Button onClick={() => set({ dir: 'text-hex', text: EXAMPLE_TEXT })}>Load example</Button>
        <Button onClick={() => set({ text: '' })}>Clear</Button>
      </div>
    </div>
  );
}
