import { useEffect, useState } from 'react';
import { Button, CopyButton, Notice } from '@/components/ui';
import { TextIn, useUtilState } from '../kit';
import { HASH_ALGS, digestUtf8, toBase64, toHex } from '../logic/hash';

type Row = { alg: string; value: string };

export default function Util() {
  const [s, set] = useUtilState('hash', { input: '', base64: false });
  const [out, setOut] = useState<{ rows: Row[] } | { error: string } | null>(null);

  useEffect(() => {
    let stale = false;
    Promise.all(
      HASH_ALGS.map(async (alg) => {
        const bytes = await digestUtf8(s.input, alg);
        return { alg, value: s.base64 ? toBase64(bytes) : toHex(bytes) };
      }),
    )
      .then((rows) => !stale && setOut({ rows }))
      .catch((e: unknown) => !stale && setOut({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      stale = true;
    };
  }, [s.input, s.base64]);

  return (
    <div className="pk-stack">
      <p className="muted">Hashes the UTF-8 bytes of the text.</p>
      <label className="pk-check">
        <input type="checkbox" checked={s.base64} onChange={(e) => set({ base64: e.target.checked })} /> Show Base64 instead of hex
      </label>
      <div className="pk-row">
        <Button onClick={() => set({ input: 'abc' })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <TextIn label="Text" rows={4} value={s.input} onChange={(input) => set({ input })} />
      {out && 'error' in out && <Notice kind="error">{out.error}</Notice>}
      {out && 'rows' in out &&
        out.rows.map((row) => (
          <div key={row.alg} className="dev-row-item">
            <strong style={{ minWidth: 72 }}>{row.alg}</strong>
            <span className="mono">{row.value}</span>
            <CopyButton text={row.value} />
          </div>
        ))}
      <Notice kind="info">MD5 is not offered: it is not part of the browser's Web Crypto API, and this tool does not fake it.</Notice>
    </div>
  );
}
