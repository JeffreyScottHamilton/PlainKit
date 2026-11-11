import { useMemo } from 'react';
import { Button, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { urlDecode, urlEncode, type UrlMode } from '../logic/url-encode';

const EXAMPLE = 'https://example.com/search?q=café & tea/ok';

export default function Util() {
  const [s, set] = useUtilState('url-encode', { input: '', direction: 'encode' as 'encode' | 'decode', scope: 'component' as UrlMode });
  const r = useMemo(() => {
    if (s.input === '') return { ok: true as const, text: '' };
    return s.direction === 'encode' ? urlEncode(s.input, s.scope) : urlDecode(s.input, s.scope);
  }, [s.input, s.direction, s.scope]);
  return (
    <div className="pk-stack">
      <div className="pk-row">
        <Segmented<'encode' | 'decode'>
          label="Direction"
          value={s.direction}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
          onChange={(direction) => set({ direction })}
        />
        <Segmented<UrlMode>
          label="Scope"
          value={s.scope}
          options={[
            { value: 'component', label: 'Component (a query value)' },
            { value: 'uri', label: 'Full URI (keeps : / ? & =)' },
          ]}
          onChange={(scope) => set({ scope })}
        />
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <Panes>
        <TextIn label="Input" value={s.input} onChange={(input) => set({ input })} error={!r.ok ? r.message : undefined} />
        <TextOut label="Result" value={r.ok ? r.text : ''} />
      </Panes>
    </div>
  );
}
