import { useMemo } from 'react';
import { Button, Notice } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { decodeJwt } from '../logic/jwt';
import '../utils-a.css';

const EXAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const NAMES = { exp: 'Expires (exp)', iat: 'Issued at (iat)', nbf: 'Not before (nbf)' } as const;

export default function Util() {
  const [s, set] = useUtilState('jwt', { input: '' });
  // Time-dependent (expired / not yet valid), so recomputed only when the input changes.
  const r = useMemo(() => (s.input.trim() === '' ? null : decodeJwt(s.input, Date.now())), [s.input]);
  return (
    <div className="pk-stack">
      <Notice kind="warn">Decoded only. The signature is NOT verified.</Notice>
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <TextIn label="JWT" rows={4} value={s.input} onChange={(input) => set({ input })} error={r && !r.ok ? r.message : undefined} />
      {r?.ok && (
        <>
          {r.expired && <Notice kind="warn">This token has expired.</Notice>}
          {r.notYetValid && <Notice kind="warn">This token is not valid yet (nbf is in the future).</Notice>}
          <Panes>
            <TextOut label="Header" value={r.headerText} />
            <TextOut label="Payload" value={r.payloadText} />
          </Panes>
          <dl className="dev-kv">
            <dt>Algorithm</dt>
            <dd className="mono">{r.alg ?? 'not stated'}</dd>
            <dt>Signature</dt>
            <dd>{r.signature === '' ? 'empty (unsecured token), not verified' : `${r.signature.length} characters, not verified`}</dd>
            {r.claims.map((c) => (
              <div key={c.name} style={{ display: 'contents' }}>
                <dt>{NAMES[c.name]}</dt>
                <dd className="mono">
                  {c.iso} ({c.seconds})
                </dd>
              </div>
            ))}
            {r.claims.some((c) => c.name === 'exp') && (
              <>
                <dt>Status</dt>
                <dd>{r.expired ? 'Expired' : 'Not expired'}</dd>
              </>
            )}
          </dl>
        </>
      )}
    </div>
  );
}
