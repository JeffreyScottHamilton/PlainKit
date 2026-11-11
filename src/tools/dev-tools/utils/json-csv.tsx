import { Button, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { csvToJson, jsonToCsv, type Delim } from '../logic/json-csv';

type Dir = 'json-csv' | 'csv-json';
const EXAMPLES: Record<Dir, string> = {
  'json-csv': '[{"name":"Lee, Ann","tags":["a","b"],"score":3},{"name":"Bo","score":null}]',
  'csv-json': 'id,name,note\n1,"Smith, J","line one\nline two"\n2,Kim,plain',
};

export default function Util() {
  const [s, set] = useUtilState('json-csv', { dir: 'json-csv' as Dir, delim: ',' as Delim, text: '' });
  const r = s.text.trim() ? (s.dir === 'json-csv' ? jsonToCsv(s.text, s.delim) : csvToJson(s.text, s.delim)) : null;
  const error = r && !r.ok ? r.error : undefined;
  return (
    <div className="pk-stack">
      <p className="muted">Converts a JSON array of objects to CSV, or CSV with a header row to JSON. Parsing uses PapaParse and runs in this tab.</p>
      <div className="pk-row">
        <Segmented
          label="Direction"
          value={s.dir}
          options={[
            { value: 'json-csv', label: 'JSON to CSV' },
            { value: 'csv-json', label: 'CSV to JSON' },
          ]}
          onChange={(v) => set({ dir: v })}
        />
        <Segmented
          label="Delimiter"
          value={s.delim}
          options={[
            { value: ',', label: 'Comma' },
            { value: ';', label: 'Semicolon' },
            { value: '\t', label: 'Tab' },
          ]}
          onChange={(v) => set({ delim: v })}
        />
      </div>
      <Panes>
        <TextIn
          label={s.dir === 'json-csv' ? 'JSON array' : 'CSV with header row'}
          value={s.text}
          onChange={(v) => set({ text: v })}
          rows={10}
          error={error}
        />
        <TextOut label={s.dir === 'json-csv' ? 'CSV' : 'JSON'} value={r?.ok ? r.output : ''} rows={10} />
      </Panes>
      <div className="pk-row">
        <Button onClick={() => set({ text: EXAMPLES[s.dir] })}>Load example</Button>
        <Button onClick={() => set({ text: '' })}>Clear</Button>
      </div>
      {r?.ok && <p className="muted">{r.rows} {r.rows === 1 ? 'row' : 'rows'} converted.</p>}
    </div>
  );
}
