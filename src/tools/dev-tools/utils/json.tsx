import { useMemo } from 'react';
import { Button, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { formatJson, type JsonIndent } from '../logic/json';

const EXAMPLE = '{"name":"Plainkit","tags":["local","free"],"version":1,"limits":{"maxMb":16}}';

export default function Util() {
  const [s, set] = useUtilState('json', { input: '', indent: '2' as JsonIndent, sortKeys: false });
  const r = useMemo(() => (s.input.trim() === '' ? null : formatJson(s.input, s.indent, s.sortKeys)), [s.input, s.indent, s.sortKeys]);
  return (
    <div className="pk-stack">
      <p className="muted">Formats, minifies, and validates JSON in your browser. Nothing is sent anywhere.</p>
      <div className="pk-row">
        <Segmented<JsonIndent>
          label="Output style"
          value={s.indent}
          options={[
            { value: 'minify', label: 'Minify' },
            { value: '2', label: '2 spaces' },
            { value: '4', label: '4 spaces' },
            { value: 'tab', label: 'Tab' },
          ]}
          onChange={(indent) => set({ indent })}
        />
        <label className="pk-check">
          <input type="checkbox" checked={s.sortKeys} onChange={(e) => set({ sortKeys: e.target.checked })} /> Sort keys
        </label>
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <Panes>
        <TextIn label="JSON input" value={s.input} onChange={(input) => set({ input })} error={r && !r.ok ? r.message : undefined} />
        <TextOut label="Result" value={r?.ok ? r.text : ''} />
      </Panes>
      {r?.ok && <Notice kind="success">Valid JSON.</Notice>}
    </div>
  );
}
