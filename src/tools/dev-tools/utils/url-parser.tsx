import { useMemo } from 'react';
import { Button, CopyButton, Notice } from '@/components/ui';
import { TextIn, useUtilState } from '../kit';
import { parseUrl } from '../logic/url-parser';
import '../utils-b.css';

const EXAMPLE = 'https://example.com:8080/docs/index.html?q=tea&tag=a&tag=b#intro';

export default function Util() {
  const [s, set] = useUtilState('url-parser', { input: '' });
  const r = useMemo(() => (s.input.trim() ? parseUrl(s.input) : null), [s.input]);
  const error = r && !r.ok ? r.error : undefined;
  return (
    <div className="pk-stack">
      <p className="muted">Parses the URL in your browser. Nothing is fetched, and links are shown as plain text.</p>
      <TextIn label="URL" value={s.input} onChange={(v) => set({ input: v })} rows={3} placeholder="https://example.com/path?x=1" error={error} />
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      {r?.ok && (
        <>
          <div className="pk-row">
            <CopyButton text={r.parts.href} label="Copy normalized URL" />
          </div>
          <table className="dev-table">
            <caption>URL parts</caption>
            <tbody>
              {(
                [
                  ['Protocol', r.parts.protocol],
                  ['Host', r.parts.host],
                  ['Hostname', r.parts.hostname],
                  ['Port', r.parts.port || '(default)'],
                  ['Path', r.parts.pathname],
                  ['Fragment', r.parts.hash || '(none)'],
                  ['Normalized URL', r.parts.href],
                ] as const
              ).map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="mono">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.parts.params.length === 0 ? (
            <Notice>No query parameters.</Notice>
          ) : (
            <table className="dev-table">
              <caption>Query parameters (decoded, in order)</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Key</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {r.parts.params.map((p, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="mono">{p.key}</td>
                    <td className="mono">{p.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
