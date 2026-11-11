import { useMemo } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { useUtilState } from '../kit';
import { subnet } from '../logic/subnet';

const EXAMPLE = '192.168.1.10/24';

export default function Util() {
  const [s, set] = useUtilState('subnet', { cidr: '' });
  const r = useMemo(() => (s.cidr.trim() ? subnet(s.cidr) : null), [s.cidr]);
  return (
    <div className="pk-stack">
      <p className="muted">IPv4 only. IPv6 addresses are not supported.</p>
      <Field label="IPv4 address with prefix" hint="Example: 192.168.1.10/24" error={r && !r.ok ? r.error : undefined}>
        {(a) => <input {...a} className="pk-input mono" value={s.cidr} spellCheck={false} onChange={(e) => set({ cidr: e.target.value })} />}
      </Field>
      <div className="pk-row">
        <Button onClick={() => set({ cidr: EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ cidr: '' })}>Clear</Button>
      </div>
      {r?.ok && (
        <>
          <table className="dev-table">
            <tbody>
              {(
                [
                  ['Network', r.info.network],
                  ['Broadcast', r.info.broadcast],
                  ['Netmask', r.info.netmask],
                  ['Wildcard', r.info.wildcard],
                  ['First host', r.info.firstHost],
                  ['Last host', r.info.lastHost],
                  ['Usable hosts', String(r.info.hostCount)],
                  ['Total addresses', String(r.info.totalAddresses)],
                ] as const
              ).map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="mono">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.info.note && <Notice kind="info">{r.info.note}</Notice>}
        </>
      )}
    </div>
  );
}
