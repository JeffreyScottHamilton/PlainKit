import { useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { addGenerated, setInputs, useAssets, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { formatBytes, outputName, uid } from '@/lib/format';
import { toToolError } from '@/lib/errors';
import { ENCODINGS, ENCODING_LABEL, MAX_BYTES, WARN_BYTES, decodeBytes, type EncodingChoice } from '@/engines/csv/decode';
import { displayHeaders, parseCsv, type Parsed, type Table } from '@/engines/csv/table';
import { dedupe, deleteColumn, findReplace, moveColumn, removeEmptyRows, renameColumn, splitColumn, trimCells, type Effect, type Scope } from '@/engines/csv/ops';
import { exportTable, formulaCellCount, type ExportFormat } from '@/engines/csv/export';
import { canRedo, canUndo, current, pushHistory, redo, startHistory, undo, type History } from '@/engines/csv/history';
import './csv.css';

type Delim = ',' | ';' | '\t' | '|';
type OpKind = 'trim' | 'empty' | 'dedupe' | 'rename' | 'reorder' | 'delete' | 'split' | 'replace';
type Setter = (patch: Partial<State>) => void;

const MAX_UNDO = 30;
const PREVIEW_ROWS = 200;
const OPS: { value: OpKind; label: string }[] = [
  { value: 'trim', label: 'Trim spaces at the ends of cells' },
  { value: 'empty', label: 'Remove empty rows' },
  { value: 'dedupe', label: 'Remove duplicate rows' },
  { value: 'rename', label: 'Rename a column' },
  { value: 'reorder', label: 'Move a column' },
  { value: 'delete', label: 'Delete a column' },
  { value: 'split', label: 'Split a column' },
  { value: 'replace', label: 'Find and replace' },
];
const DELIMS: { value: 'auto' | Delim; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe' },
];

type State = {
  /** Text pasted and committed by the user. Used only when no file is selected. */
  pasted: string | null;
  pasteDraft: string;
  pasteId: string;
  enc: EncodingChoice;
  delim: 'auto' | Delim;
  header: boolean;
  quote: string;
  /** Undo history for one import. Ignored when importKey no longer matches (settings or file changed). */
  hist: { key: string; h: History<Table> } | null;
  op: OpKind;
  scopeAll: boolean;
  sel: number[];
  dedupeMode: 'exact' | 'normalized';
  col: number;
  dest: number;
  newName: string;
  sep: string;
  parts: number;
  find: string;
  replaceWith: string;
  regex: boolean;
  matchCase: boolean;
  expFormat: ExportFormat;
  expDelim: Delim;
  eol: 'LF' | 'CRLF';
  bom: boolean;
  quoteAll: boolean;
  formulaSafe: boolean;
  exportedId: string | null;
  exportMsg: { kind: 'ok' | 'error'; text: string } | null;
};

const INITIAL: State = {
  pasted: null,
  pasteDraft: '',
  pasteId: '',
  enc: 'auto',
  delim: 'auto',
  header: true,
  quote: '"',
  hist: null,
  op: 'trim',
  scopeAll: true,
  sel: [],
  dedupeMode: 'exact',
  col: 0,
  dest: 0,
  newName: '',
  sep: ',',
  parts: 2,
  find: '',
  replaceWith: '',
  regex: false,
  matchCase: false,
  expFormat: 'csv',
  expDelim: ',',
  eol: 'LF',
  bom: false,
  quoteAll: false,
  formulaSafe: false,
  exportedId: null,
  exportMsg: null,
};

type Bytes = { id: string; data: Uint8Array | null; error?: string };
type Loaded = { ok: true; parsed: Parsed; encoding: string; bom: boolean } | { ok: false; message: string; next: string };
type Plan = { ok: true; effect: Effect; text: string; can: boolean } | { ok: false; message: string };

export default function Tool() {
  const [st, setSt] = useToolState<State>('csv', INITIAL);
  const inputs = useToolInputs('csv');
  const assets = useAssets();
  const file = inputs[inputs.length - 1];
  const fileId = file?.id;
  const fileBlob = file?.blob;
  const fileTooBig = !!file && file.size > MAX_BYTES;
  const [bytes, setBytes] = useState<Bytes | null>(null);

  // Read the original bytes once per file. Settings changes re-decode these bytes; the file is never written.
  useEffect(() => {
    if (!fileId || !fileBlob || fileTooBig) {
      setBytes(null);
      return;
    }
    let alive = true;
    fileBlob.arrayBuffer().then(
      (b) => {
        if (alive) setBytes({ id: fileId, data: new Uint8Array(b) });
      },
      () => {
        if (alive) setBytes({ id: fileId, data: null, error: 'The browser could not read this file.' });
      },
    );
    return () => {
      alive = false;
    };
  }, [fileId, fileBlob, fileTooBig]);

  const loaded = useMemo((): Loaded | null => {
    if (fileTooBig && file) return { ok: false, message: `This file is ${formatBytes(file.size)}. The limit is 200 MB.`, next: 'Split the file into smaller parts and load each one.' };
    let text: string;
    let encoding: string;
    let bom = false;
    if (file) {
      if (!bytes || bytes.id !== fileId) return null;
      if (!bytes.data) return { ok: false, message: bytes.error ?? 'The file could not be read.', next: 'Choose the file again.' };
      const d = decodeBytes(bytes.data, st.enc);
      text = d.text;
      encoding = d.encoding;
      bom = d.bom;
    } else if (st.pasted !== null) {
      text = st.pasted;
      encoding = 'Pasted text (not decoded)';
    } else return null;
    try {
      return { ok: true, parsed: parseCsv(text, { delimiter: st.delim, quote: st.quote, header: st.header }), encoding, bom };
    } catch (e) {
      const err = toToolError(e);
      return { ok: false, message: err.message, next: err.nextAction ?? 'Change the import settings.' };
    }
  }, [file, fileId, fileTooBig, bytes, st.enc, st.delim, st.header, st.quote, st.pasted]);

  const base = loaded?.ok ? loaded.parsed.table : null;
  const importKey = `${fileId ?? `paste:${st.pasteId}`}|${st.enc}|${st.delim}|${st.header}|${st.quote}`;
  const hist: History<Table> | null = base ? (st.hist?.key === importKey ? st.hist.h : startHistory(base)) : null;
  const table = hist ? current(hist) : null;

  const write = (h: History<Table>) => setSt({ hist: { key: importKey, h } });
  const commit = (next: Table) => {
    if (hist) write(pushHistory(hist, next, MAX_UNDO));
  };

  const names = table ? displayHeaders(table.headers) : [];
  const hasSource = file !== undefined || st.pasted !== null;

  const usePasted = () => {
    setInputs('csv', []);
    setSt({ pasted: st.pasteDraft, pasteId: uid(), hist: null, exportedId: null, exportMsg: null });
  };

  const exportNow = () => {
    if (!table) return;
    try {
      const r = exportTable(table, {
        format: st.expFormat,
        delimiter: st.expFormat === 'tsv' ? '\t' : st.expDelim,
        eol: st.eol,
        bom: st.bom,
        quoteAll: st.quoteAll,
        formulaSafe: st.formulaSafe,
        includeHeader: st.header,
      });
      const asset = addGenerated({
        name: outputName(file?.name ?? 'pasted.csv', 'cleaned', r.ext),
        mime: r.mime,
        blob: new Blob([r.text], { type: r.mime }),
        parentIds: file ? [file.id] : [],
      });
      const extra = r.renamedHeaders ? ` ${r.renamedHeaders} duplicate ${r.renamedHeaders === 1 ? 'header was' : 'headers were'} renamed so JSON keys are unique.` : '';
      setSt({ exportedId: asset.id, exportMsg: { kind: 'ok', text: `Verified: ${r.verifiedRows} rows read back and matched.${extra}` } });
    } catch (e) {
      const err = toToolError(e);
      setSt({ exportMsg: { kind: 'error', text: `${err.message} ${err.nextAction ?? ''}`.trim() } });
    }
  };

  const exported = st.exportedId ? assets.find((a) => a.id === st.exportedId) : undefined;
  const formulaCount = table && st.formulaSafe && st.expFormat !== 'json' ? formulaCellCount(table, st.header) : 0;

  return (
    <ToolPage
      toolId="csv"
      settings={
        <>
          <h2>Import settings</h2>
          <Field label="Encoding" hint={file ? 'Auto checks the byte order mark, then UTF-8, then Windows-1252.' : 'Used for files. Pasted text is already decoded.'}>
            {(a) => (
              <select {...a} className="pk-select" value={st.enc} disabled={!file} onChange={(e) => setSt({ enc: e.target.value as EncodingChoice })}>
                {ENCODINGS.map((v) => (
                  <option key={v} value={v}>
                    {ENCODING_LABEL[v]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Delimiter" hint={table && st.delim === 'auto' ? `Detected: ${delimName(loaded?.ok ? loaded.parsed.delimiter : ',')}.` : undefined}>
            {(a) => (
              <select {...a} className="pk-select" value={st.delim} onChange={(e) => setSt({ delim: e.target.value as 'auto' | Delim })}>
                {DELIMS.map((d) => (
                  <option key={d.label} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <label className="pk-check">
            <input type="checkbox" checked={st.header} onChange={(e) => setSt({ header: e.target.checked })} />
            First row is the header
          </label>
          <Field
            label="Quote character"
            hint={st.quote.length !== 1 ? 'Enter exactly one character.' : st.quote === st.delim ? 'Must differ from the delimiter.' : 'Usually " (double quote).'}
            error={st.quote.length !== 1 || st.quote === st.delim ? 'Fix this setting' : undefined}
          >
            {(a) => <input {...a} className="pk-input" value={st.quote} maxLength={2} onChange={(e) => setSt({ quote: e.target.value })} />}
          </Field>
          <p className="csv-aside-note">Changing these settings re-reads the original file and starts the undo history again.</p>
        </>
      }
    >
      <section className="csv-section" aria-labelledby="csv-src-h">
        <h2 id="csv-src-h">Input</h2>
        <DropZone toolId="csv" multiple={false} accept=".csv,.tsv,.txt" hint="Files are read in this browser and never uploaded. The whole file is loaded into memory." />
        <details>
          <summary>Or paste CSV or TSV text</summary>
          <div className="csv-paste">
            <Field label="Pasted table" hint="Pasting replaces the current file in this tool.">
              {(a) => (
                <textarea {...a} className="pk-textarea" rows={5} spellCheck={false} value={st.pasteDraft} onChange={(e) => setSt({ pasteDraft: e.target.value })} />
              )}
            </Field>
            <div className="csv-actions">
              <Button onClick={usePasted} disabled={st.pasteDraft === ''}>
                Use pasted text
              </Button>
            </div>
          </div>
        </details>

        {file && (
          <ul className="pk-assets" aria-label="Current file">
            <AssetRow asset={file} exclude="csv" />
          </ul>
        )}
        {file && file.size > WARN_BYTES && file.size <= MAX_BYTES && (
          <Notice kind="warn">
            This file is {formatBytes(file.size)}. Everything is held in memory, so the browser may slow down. Files over 200 MB are refused.
          </Notice>
        )}
        {loaded && !loaded.ok && (
          <Notice kind="error">
            <strong>{loaded.message}</strong>
            <div>{loaded.next}</div>
          </Notice>
        )}
        {loaded?.ok && loaded.parsed.parseErrors.length > 0 && (
          <Notice kind="warn">
            The parser reported problems. Check these rows: {loaded.parsed.parseErrors.join(' ')}
          </Notice>
        )}
        {loaded?.ok && loaded.parsed.raggedRows > 0 && (
          <Notice kind="info">
            {loaded.parsed.raggedRows} {loaded.parsed.raggedRows === 1 ? 'row has' : 'rows have'} a different number of fields from the header. Missing cells were padded with empty values.
          </Notice>
        )}
        {!hasSource && <p className="csv-muted">Choose a file or paste text to start. Nothing is processed until you change it.</p>}

        {table && loaded?.ok && (
          <p className="csv-stats" aria-label="Table summary">
            <span>
              {table.rows.length.toLocaleString('en-US')} rows
            </span>
            <span>{table.headers.length} columns</span>
            <span>Encoding: {loaded.encoding}</span>
            <span>Delimiter: {delimName(loaded.parsed.delimiter)}{st.delim === 'auto' ? ' (auto)' : ''}</span>
            <span>Header: {st.header ? 'first row' : 'none'}</span>
            {loaded.bom && <span>Byte order mark removed</span>}
            {file && <span>{formatBytes(file.size)}</span>}
          </p>
        )}
      </section>

      {table && hist && (
        <>
          <section className="csv-section" aria-labelledby="csv-op-h">
            <h2 id="csv-op-h">Clean</h2>
            <p className="csv-muted">Each change shows a preview. Nothing changes until you press Apply.</p>
            <OperationPanel table={table} names={names} st={st} setSt={setSt} commit={commit} />
            <div className="csv-actions" role="group" aria-label="History">
              <Button onClick={() => write(undo(hist))} disabled={!canUndo(hist)}>
                Undo
              </Button>
              <Button onClick={() => write(redo(hist))} disabled={!canRedo(hist)}>
                Redo
              </Button>
              <Button onClick={() => base && commit(base)} disabled={table === base}>
                Reset to import
              </Button>
              <span className="csv-muted">{hist.index} undo {hist.index === 1 ? 'step' : 'steps'} available</span>
            </div>
          </section>

          <section className="csv-section" aria-labelledby="csv-prev-h">
            <h2 id="csv-prev-h">Preview</h2>
            <p className="csv-preview">
              {table.rows.length > PREVIEW_ROWS
                ? `Showing ${PREVIEW_ROWS} of ${table.rows.length.toLocaleString('en-US')} rows`
                : `${table.rows.length.toLocaleString('en-US')} rows`}
              {' · '}
              {table.headers.length} columns
            </p>
            <div className="csv-scroll" role="region" aria-label="Preview table" tabIndex={0}>
              <table className="csv-table">
                <caption className="sr-only">Current table, first {PREVIEW_ROWS} rows</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    {names.map((n, i) => (
                      <th scope="col" key={i} title={n}>
                        {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={i}>
                      <th scope="row">{i + 1}</th>
                      {r.map((v, j) => (
                        <td key={j} title={v}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="csv-section" aria-labelledby="csv-exp-h">
            <h2 id="csv-exp-h">Export</h2>
            <div className="pk-field">
              <span className="pk-label">Format</span>
              <Segmented<ExportFormat>
                label="Export format"
                value={st.expFormat}
                options={[
                  { value: 'csv', label: 'CSV' },
                  { value: 'tsv', label: 'TSV' },
                  { value: 'json', label: 'JSON' },
                ]}
                onChange={(v) => setSt({ expFormat: v })}
              />
            </div>
            <div className="csv-row">
              <Field label="CSV delimiter" hint={st.expFormat === 'csv' ? undefined : 'Not used for this format.'}>
                {(a) => (
                  <select {...a} className="pk-select" value={st.expDelim} disabled={st.expFormat !== 'csv'} onChange={(e) => setSt({ expDelim: e.target.value as Delim })}>
                    <option value=",">Comma</option>
                    <option value=";">Semicolon</option>
                    <option value="|">Pipe</option>
                    <option value={'\t'}>Tab</option>
                  </select>
                )}
              </Field>
              <div className="pk-field">
                <span className="pk-label">Line ending</span>
                <Segmented<'LF' | 'CRLF'>
                  label="Line ending"
                  value={st.eol}
                  options={[
                    { value: 'LF', label: 'LF' },
                    { value: 'CRLF', label: 'CRLF' },
                  ]}
                  onChange={(v) => setSt({ eol: v })}
                />
              </div>
            </div>
            <label className="pk-check">
              <input type="checkbox" checked={st.bom} disabled={st.expFormat === 'json'} onChange={(e) => setSt({ bom: e.target.checked })} />
              Include a byte order mark (helps Excel read UTF-8)
            </label>
            <label className="pk-check">
              <input type="checkbox" checked={st.quoteAll} disabled={st.expFormat === 'json'} onChange={(e) => setSt({ quoteAll: e.target.checked })} />
              Quote every field
            </label>
            <div>
              <label className="pk-check">
                <input type="checkbox" checked={st.formulaSafe} disabled={st.expFormat === 'json'} onChange={(e) => setSt({ formulaSafe: e.target.checked })} />
                Protect against spreadsheet formulas: prefix cells starting with = + - @ tab or carriage return with an apostrophe
              </label>
              {st.expFormat === 'json' && <p className="csv-muted">Not applied to JSON.</p>}
              {st.formulaSafe && st.expFormat !== 'json' && (
                <p className="csv-muted" role="status">
                  {formulaCount.toLocaleString('en-US')} {formulaCount === 1 ? 'cell' : 'cells'} will be changed before export. Values that start with these characters can run as formulas in a spreadsheet.
                </p>
              )}
            </div>
            <div className="csv-actions">
              <Button variant="primary" onClick={exportNow} disabled={!table}>
                Export {st.expFormat.toUpperCase()}
              </Button>
              <span className="csv-muted">
                {table ? `${table.rows.length.toLocaleString('en-US')} rows will be exported.` : ''}
                {st.expFormat !== 'json' && st.header ? ' The header row is included.' : ''}
              </span>
            </div>
            {st.exportMsg && <Notice kind={st.exportMsg.kind === 'ok' ? 'success' : 'error'}>{st.exportMsg.text}</Notice>}
            {exported && (
              <ul className="pk-assets" aria-label="Exported file">
                <AssetRow asset={exported} exclude="csv" detail={`${table ? table.rows.length.toLocaleString('en-US') : 0} rows`} />
              </ul>
            )}
          </section>
        </>
      )}
    </ToolPage>
  );
}

function delimName(d: string): string {
  return d === ',' ? 'comma' : d === ';' ? 'semicolon' : d === '\t' ? 'tab' : d === '|' ? 'pipe' : `"${d}"`;
}

function ScopeFields({ names, st, setSt }: { names: string[]; st: State; setSt: Setter }) {
  return (
    <fieldset className="csv-fieldset">
      <legend>Columns</legend>
      <label className="pk-check">
        <input type="checkbox" checked={st.scopeAll} onChange={(e) => setSt({ scopeAll: e.target.checked })} />
        All columns
      </label>
      {!st.scopeAll && (
        <div className="csv-cols">
          {names.map((n, i) => (
            <label key={i} className="pk-check">
              <input
                type="checkbox"
                checked={st.sel.includes(i)}
                onChange={(e) => setSt({ sel: e.target.checked ? [...st.sel, i] : st.sel.filter((x) => x !== i) })}
              />
              {n}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function ColumnSelect({ names, value, onChange, label }: { names: string[]; value: number; onChange: (i: number) => void; label: string }) {
  return (
    <Field label={label}>
      {(a) => (
        <select {...a} className="pk-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {names.map((n, i) => (
            <option key={i} value={i}>
              {i + 1}. {n}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function plan(t: Table, s: State): Plan {
  const scope: Scope = s.scopeAll ? null : s.sel.filter((i) => i < t.headers.length);
  const names = displayHeaders(t.headers);
  const width = t.headers.length;
  const col = s.col;
  const colName = names[col] ?? '';
  const ok = (effect: Effect, text: string, can: boolean): Plan => ({ ok: true, effect, text, can });
  const cells = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'cell' : 'cells'}`;
  const rows = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'}`;
  try {
    switch (s.op) {
      case 'trim': {
        const e = trimCells(t, scope);
        return ok(e, `Would change ${cells(e.summary.changedCells)}.`, e.summary.changedCells > 0);
      }
      case 'empty': {
        const e = removeEmptyRows(t);
        return ok(e, `Would remove ${rows(e.summary.removedRows).replace(/ (rows?)$/, ' empty $1')}.`, e.summary.removedRows > 0);
      }
      case 'dedupe': {
        const e = dedupe(t, scope, s.dedupeMode);
        const how = s.dedupeMode === 'exact' ? 'exact match' : 'normalized match (ignores case, outer spaces, repeated spaces)';
        return ok(e, `Would remove ${e.summary.removedRows.toLocaleString('en-US')} duplicate ${e.summary.removedRows === 1 ? 'row' : 'rows'} by ${how}, keeping the first.`, e.summary.removedRows > 0);
      }
      case 'rename': {
        if (col >= width) throw new Error('Choose a column.');
        const e = renameColumn(t, col, s.newName);
        return ok(e, `Column "${colName}" will be renamed to "${s.newName}".`, s.newName !== (t.headers[col] ?? ''));
      }
      case 'reorder': {
        if (col >= width) throw new Error('Choose a column.');
        const e = moveColumn(t, col, s.dest);
        return ok(e, `Column "${colName}" moves from position ${col + 1} to position ${s.dest + 1}.`, s.dest !== col);
      }
      case 'delete': {
        if (col >= width) throw new Error('Choose a column.');
        const e = deleteColumn(t, col);
        return ok(e, `Would delete column "${colName}" (${e.summary.note ?? ''}).`, true);
      }
      case 'split': {
        if (col >= width) throw new Error('Choose a column.');
        const e = splitColumn(t, col, s.sep, s.parts);
        const extra = e.summary.note ? ` ${e.summary.note}.` : '';
        return ok(e, `Would split ${cells(e.summary.changedCells)} into ${s.parts} columns.${extra}`, e.summary.changedCells > 0);
      }
      case 'replace': {
        if (s.find === '') return { ok: false, message: 'Enter the text to find.' };
        const e = findReplace(t, { find: s.find, replace: s.replaceWith, regex: s.regex, matchCase: s.matchCase, scope });
        return ok(e, `Would change ${cells(e.summary.changedCells)}.`, e.summary.changedCells > 0);
      }
    }
  } catch (e) {
    return { ok: false, message: toToolError(e).message + (toToolError(e).nextAction ? ` ${toToolError(e).nextAction}` : '') };
  }
}

function OperationPanel({ table, names, st, setSt, commit }: { table: Table; names: string[]; st: State; setSt: Setter; commit: (t: Table) => void }) {
  const p = plan(table, st);
  const scopeNeeded = (st.op === 'trim' || st.op === 'dedupe' || st.op === 'replace') && !st.scopeAll;
  const apply = () => {
    if (!p.ok || !p.can) return;
    commit(p.effect.table);
  };
  return (
    <div className="csv-stack">
      <Field label="Operation">
        {(a) => (
          <select {...a} className="pk-select" value={st.op} onChange={(e) => setSt({ op: e.target.value as OpKind })}>
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      {(st.op === 'trim' || st.op === 'replace' || st.op === 'dedupe') && <ScopeFields names={names} st={st} setSt={setSt} />}

      {st.op === 'dedupe' && (
        <div className="pk-field">
          <span className="pk-label">Match</span>
          <Segmented<'exact' | 'normalized'>
            label="Duplicate match"
            value={st.dedupeMode}
            options={[
              { value: 'exact', label: 'Exact' },
              { value: 'normalized', label: 'Normalized' },
            ]}
            onChange={(v) => setSt({ dedupeMode: v })}
          />
          <span className="pk-hint">
            {st.dedupeMode === 'exact' ? 'Values must match exactly, including case and spaces.' : 'Ignores letter case, spaces at the ends, and repeated spaces inside values.'}
          </span>
        </div>
      )}

      {(st.op === 'rename' || st.op === 'reorder' || st.op === 'delete' || st.op === 'split') && (
        <ColumnSelect names={names} value={st.col} label="Column" onChange={(i) => setSt({ col: i, dest: i })} />
      )}

      {st.op === 'rename' && (
        <Field label="New name" hint="Leave empty to show the column as Column N.">
          {(a) => <input {...a} className="pk-input" value={st.newName} onChange={(e) => setSt({ newName: e.target.value })} />}
        </Field>
      )}

      {st.op === 'reorder' && (
        <div className="csv-row" role="group" aria-label="Move column">
          <Button onClick={() => setSt({ dest: Math.max(0, st.dest - 1) })} disabled={st.dest <= 0}>
            Move left
          </Button>
          <Button onClick={() => setSt({ dest: Math.min(table.headers.length - 1, st.dest + 1) })} disabled={st.dest >= table.headers.length - 1}>
            Move right
          </Button>
          <span className="csv-muted">Target position: {st.dest + 1} of {table.headers.length}</span>
        </div>
      )}

      {st.op === 'split' && (
        <div className="csv-row">
          <Field label="Separator" hint="Text the cells are split on.">
            {(a) => <input {...a} className="pk-input" value={st.sep} onChange={(e) => setSt({ sep: e.target.value })} />}
          </Field>
          <Field label="New columns" hint="Between 2 and 10.">
            {(a) => (
              <input {...a} className="pk-input" type="number" min={2} max={10} value={st.parts} onChange={(e) => setSt({ parts: Number(e.target.value) })} />
            )}
          </Field>
        </div>
      )}

      {st.op === 'replace' && (
        <>
          <div className="csv-row">
            <Field label="Find">
              {(a) => <input {...a} className="pk-input" value={st.find} onChange={(e) => setSt({ find: e.target.value })} />}
            </Field>
            <Field label="Replace with" hint={st.regex ? 'Use $1 for a group.' : 'Written as typed.'}>
              {(a) => <input {...a} className="pk-input" value={st.replaceWith} onChange={(e) => setSt({ replaceWith: e.target.value })} />}
            </Field>
          </div>
          <div className="csv-row">
            <label className="pk-check">
              <input type="checkbox" checked={st.regex} onChange={(e) => setSt({ regex: e.target.checked })} />
              Regular expression
            </label>
            <label className="pk-check">
              <input type="checkbox" checked={st.matchCase} onChange={(e) => setSt({ matchCase: e.target.checked })} />
              Match case
            </label>
          </div>
        </>
      )}

      {scopeNeeded && st.sel.length === 0 && <Notice kind="warn">Tick at least one column.</Notice>}
      {!p.ok ? <Notice kind="error">{p.message}</Notice> : <p className="csv-preview" role="status">{p.text}</p>}
      <div className="csv-actions">
        <Button variant={st.op === 'delete' ? 'danger' : 'primary'} onClick={apply} disabled={!p.ok || !p.can || (scopeNeeded && st.sel.length === 0)}>
          Apply
        </Button>
      </div>
    </div>
  );
}
