import { useEffect, useMemo, useRef, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { addGenerated, setInputs, useAssets, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { formatBytes, outputName, uid } from '@/lib/format';
import { toToolError } from '@/lib/errors';
import { formatTime, parseTime, type Cue, type Format } from '@/engines/subtitles/model';
import { parseSubtitles } from '@/engines/subtitles/parse';
import { toSrt, toVtt } from '@/engines/subtitles/serialize';
import { countBySeverity, validate } from '@/engines/subtitles/validate';
import { canRedo, canUndo, current, pushHistory, redo, startHistory, undo, type History } from '@/engines/subtitles/history';
import { deleteCue, editCue, findCues, insertAfter, mergeWithNext, replaceInCues, shiftCues, splitCue } from '@/engines/subtitles/ops';
import { ExtractTracks } from './ExtractTracks';
import { Transcribe } from './Transcribe';
import './subtitles.css';

const PAGE = 100;
const MAX_UNDO = 50;
const ISSUE_LIST = 50;
const MAX_TEXT_BYTES = 200 * 1024 * 1024;

type State = {
  pasted: string | null;
  pasteDraft: string;
  pasteId: string;
  /** Cue edits for one source. Ignored when key no longer matches the source. */
  hist: { key: string; h: History<Cue[]> } | null;
  query: string;
  replaceWith: string;
  matchCase: boolean;
  page: number;
  selected: number[];
  shiftMs: string;
  shiftScope: 'all' | 'selected';
  splitPct: string;
  jump: number | null;
  note: string | null;
  outFmt: Format;
  exportedId: string | null;
  exportMsg: { kind: 'ok' | 'error' | 'warn'; text: string } | null;
};

const INITIAL: State = {
  pasted: null,
  pasteDraft: '',
  pasteId: '',
  hist: null,
  query: '',
  replaceWith: '',
  matchCase: false,
  page: 0,
  selected: [],
  shiftMs: '0',
  shiftScope: 'all',
  splitPct: '50',
  jump: null,
  note: null,
  outFmt: 'srt',
  exportedId: null,
  exportMsg: null,
};

type TextState = { id: string; value: string | null; error?: string };

export default function Tool() {
  const [st, setSt] = useToolState<State>('subtitles', INITIAL);
  const inputs = useToolInputs('subtitles');
  const assets = useAssets();
  const file = inputs[inputs.length - 1];
  const fileId = file?.id;
  const fileBlob = file?.blob;
  const tooBig = !!file && file.size > MAX_TEXT_BYTES;
  const [text, setText] = useState<TextState | null>(null);

  // Read the file once per selection. Only UTF-8 is accepted, so a wrong encoding is reported instead of guessed.
  useEffect(() => {
    if (!fileId || !fileBlob || tooBig) {
      setText(null);
      return;
    }
    let alive = true;
    fileBlob.arrayBuffer().then(
      (buf) => {
        if (!alive) return;
        try {
          setText({ id: fileId, value: new TextDecoder('utf-8', { fatal: true }).decode(buf) });
        } catch {
          setText({ id: fileId, value: null, error: 'This file is not UTF-8 text. Save it as UTF-8 and load it again.' });
        }
      },
      () => {
        if (alive) setText({ id: fileId, value: null, error: 'The browser could not read this file.' });
      },
    );
    return () => {
      alive = false;
    };
  }, [fileId, fileBlob, tooBig]);

  const source: { key: string; name: string; value: string | null; error?: string } | null = file
    ? tooBig
      ? { key: file.id, name: file.name, value: null, error: `This file is ${formatBytes(file.size)}. The limit is 200 MB.` }
      : text?.id === file.id
        ? { key: file.id, name: file.name, value: text.value, error: text.error }
        : null
    : st.pasted !== null
      ? { key: `paste:${st.pasteId}`, name: 'subtitles', value: st.pasted }
      : null;

  const parsed = useMemo(() => (source?.value != null ? parseSubtitles(source.value) : null), [source?.value]);
  const hist: History<Cue[]> | null = parsed && source ? (st.hist?.key === source.key ? st.hist.h : startHistory(parsed.cues)) : null;
  const cues = hist ? current(hist) : [];
  const issues = useMemo(() => validate(cues), [cues]);
  const counts = countBySeverity(issues);
  const preamble = parsed?.preamble ?? [];

  const commit = (next: Cue[], structural = false) => {
    if (!hist || !source) return;
    setSt({ hist: { key: source.key, h: pushHistory(hist, next, MAX_UNDO) }, note: null, ...(structural ? { selected: [] } : {}) });
  };
  const write = (h: History<Cue[]>) => {
    if (source) setSt({ hist: { key: source.key, h }, note: null });
  };

  // Filtering and paging over the filtered list. Page is clamped so a shorter list never shows an empty page.
  const matches = useMemo(() => findCues(cues, st.query), [cues, st.query]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const page = Math.min(st.page, pages - 1);
  const visible = matches.slice(page * PAGE, page * PAGE + PAGE);

  // Jump to an issue: the target cue is shown and its start field receives focus.
  const focusStart = useRef<number | null>(null);
  useEffect(() => {
    if (st.jump === null) return;
    focusStart.current = st.jump;
    setSt({ jump: null });
  }, [st.jump, setSt]);
  useEffect(() => {
    if (focusStart.current === null) return;
    const el = document.getElementById(`sub-start-${focusStart.current}`);
    focusStart.current = null;
    el?.focus();
  });
  const jumpTo = (i: number) => setSt({ query: '', page: Math.floor(i / PAGE), jump: i });

  const replaced = useMemo(() => replaceInCues(cues, st.query, st.replaceWith, st.matchCase), [cues, st.query, st.replaceWith, st.matchCase]);

  const shift = () => {
    const ms = Number(st.shiftMs);
    if (st.shiftMs.trim() === '' || !Number.isInteger(ms)) {
      setSt({ note: 'Enter a whole number of milliseconds, for example -500 or 1500.' });
      return;
    }
    const scope = st.shiftScope === 'selected' ? new Set(st.selected) : null;
    if (scope && scope.size === 0) {
      setSt({ note: 'Select at least one cue, or shift all cues.' });
      return;
    }
    const r = shiftCues(cues, ms, scope);
    commit(r.cues);
    if (r.clamped > 0) setSt({ note: `${r.clamped} ${r.clamped === 1 ? 'cue was' : 'cues were'} moved to 0 ms, because the shift would have made ${r.clamped === 1 ? 'it' : 'them'} negative.` });
  };

  const tryStructural = (fn: () => Cue[]) => {
    try {
      commit(fn(), true);
    } catch (e) {
      setSt({ note: toToolError(e).message + (toToolError(e).nextAction ? ` ${toToolError(e).nextAction}` : '') });
    }
  };

  const splitPct = Number(st.splitPct) / 100;

  const exportNow = () => {
    if (!source || !parsed) return;
    const out = st.outFmt === 'srt' ? toSrt(cues) : toVtt(cues, preamble);
    // Read the export back and compare every cue time, so a bad write cannot pass silently.
    const back = parseSubtitles(out);
    const same = back.cues.length === cues.length && back.cues.every((c, i) => c.start === cues[i]?.start && c.end === cues[i]?.end);
    if (!same || back.errors.length > 0) {
      setSt({ exportMsg: { kind: 'error', text: 'Nothing was exported: the export did not read back with the same cue times. Try again.' } });
      return;
    }
    const mime = st.outFmt === 'srt' ? 'application/x-subrip' : 'text/vtt';
    const asset = addGenerated({
      name: outputName(source.name, 'edited', st.outFmt),
      mime,
      blob: new Blob([out], { type: mime }),
      parentIds: file ? [file.id] : [],
    });
    setSt({ exportedId: asset.id, exportMsg: { kind: 'ok', text: `Verified: ${cues.length} cues read back with the same times.` } });
  };

  // Transcript into the editor. With an open file or text it is one undo step; with nothing open it becomes the pasted source.
  const applyTranscript = (next: Cue[]) => {
    if (hist && source) {
      commit(next, true);
      return;
    }
    setInputs('subtitles', []);
    setSt({ pasted: toSrt(next), pasteId: uid(), hist: null, exportedId: null, exportMsg: null, selected: [], page: 0, note: null });
  };

  const exported = st.exportedId ? assets.find((a) => a.id === st.exportedId) : undefined;
  const dropsPreamble = st.outFmt === 'srt' ? preamble.length : 0;
  const dropsSettings = st.outFmt === 'srt' ? cues.filter((c) => c.settings).length : 0;
  const canExport = !!source && !!parsed && cues.length > 0 && counts.error === 0;

  return (
    <ToolPage
      toolId="subtitles"
      settings={
        <>
          <h2>Timing</h2>
          <Field label="Offset (ms)" hint="Positive moves cues later. Negative moves them earlier.">
            {(a) => (
              <input {...a} className="pk-input" type="number" step={1} value={st.shiftMs} onChange={(e) => setSt({ shiftMs: e.target.value })} />
            )}
          </Field>
          <div className="pk-field">
            <span className="pk-label">Apply offset to</span>
            <Segmented<'all' | 'selected'>
              label="Apply offset to"
              value={st.shiftScope}
              options={[
                { value: 'all', label: 'All cues' },
                { value: 'selected', label: `Selected (${st.selected.length})` },
              ]}
              onChange={(v) => setSt({ shiftScope: v })}
            />
          </div>
          <Button onClick={shift} disabled={!hist}>
            Apply offset
          </Button>
          <Field label="Split point (%)" hint="Used by the Split buttons. Between 1 and 99.">
            {(a) => <input {...a} className="pk-input" type="number" min={1} max={99} value={st.splitPct} onChange={(e) => setSt({ splitPct: e.target.value })} />}
          </Field>

          <h2>Export</h2>
          <div className="pk-field">
            <span className="pk-label">Output format</span>
            <Segmented<Format>
              label="Output format"
              value={st.outFmt}
              options={[
                { value: 'srt', label: 'SRT' },
                { value: 'vtt', label: 'WebVTT' },
              ]}
              onChange={(v) => setSt({ outFmt: v })}
            />
          </div>
          {dropsPreamble > 0 && <Notice kind="warn">SRT has no header. The WEBVTT header and {dropsPreamble} NOTE, STYLE or REGION {dropsPreamble === 1 ? 'block' : 'blocks'} will be dropped.</Notice>}
          {dropsSettings > 0 && <Notice kind="warn">SRT has no cue settings. {dropsSettings} cue {dropsSettings === 1 ? 'setting' : 'settings'} will be dropped.</Notice>}
          {counts.error > 0 && <Notice kind="error">Fix {counts.error} {counts.error === 1 ? 'error' : 'errors'} before exporting.</Notice>}
          <Button variant="primary" block onClick={exportNow} disabled={!canExport}>
            Export subtitles
          </Button>
          {st.exportMsg && <Notice kind={st.exportMsg.kind === 'ok' ? 'success' : st.exportMsg.kind === 'warn' ? 'warn' : 'error'}>{st.exportMsg.text}</Notice>}
          {exported && (
            <ul className="pk-assets" aria-label="Exported file">
              <AssetRow asset={exported} exclude="subtitles" detail={`${cues.length} cues`} />
            </ul>
          )}
        </>
      }
    >
      <section className="sub-section" aria-labelledby="sub-in-h">
        <h2 id="sub-in-h">Subtitle file</h2>
        <p className="sub-muted">
          This edits subtitle text files. Reading text tracks stored in an MKV or WebM file, and speech transcription, are separate optional sections below. It cannot read subtitles that are burned into the picture.
        </p>
        <DropZone toolId="subtitles" multiple={false} accept=".srt,.vtt,.txt" hint="SRT or WebVTT, UTF-8 text. Read in this browser." />
        <details>
          <summary>Or paste subtitle text</summary>
          <div className="sub-stack">
            <Field label="Subtitle text">
              {(a) => <textarea {...a} className="pk-textarea" rows={6} spellCheck={false} value={st.pasteDraft} onChange={(e) => setSt({ pasteDraft: e.target.value })} />}
            </Field>
            <div className="sub-actions">
              <Button
                onClick={() => {
                  setInputs('subtitles', []);
                  setSt({ pasted: st.pasteDraft, pasteId: uid(), hist: null, exportedId: null, exportMsg: null, selected: [], page: 0 });
                }}
                disabled={st.pasteDraft.trim() === ''}
              >
                Use pasted text
              </Button>
            </div>
          </div>
        </details>
        {file && (
          <ul className="pk-assets" aria-label="Current file">
            <AssetRow asset={file} exclude="subtitles" />
          </ul>
        )}
        {source?.error && <Notice kind="error">{source.error}</Notice>}
        {!source && !file && <p className="sub-muted">Choose a file or paste text to start. Nothing changes until you edit it.</p>}
        {file && !source?.error && !parsed && <p className="sub-muted">Reading file…</p>}
      </section>

      {parsed && hist && (
        <>
          <section className="sub-section" aria-labelledby="sub-stat-h">
            <h2 id="sub-stat-h">Summary</h2>
            <p className="sub-muted">
              {parsed.format === 'vtt' ? 'WebVTT' : 'SRT'} · {cues.length.toLocaleString('en-US')} cues
              {parsed.preamble.length > 0 ? ` · ${parsed.preamble.length} header or NOTE/STYLE/REGION ${parsed.preamble.length === 1 ? 'block' : 'blocks'} kept` : ''}
            </p>
            {parsed.errors.length > 0 && (
              <Notice kind="warn">
                <strong>
                  {parsed.errors.length} {parsed.errors.length === 1 ? 'block' : 'blocks'} could not be read and {parsed.errors.length === 1 ? 'was' : 'were'} not imported:
                </strong>
                <ul>
                  {parsed.errors.slice(0, 20).map((e) => (
                    <li key={e.line}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
                {parsed.errors.length > 20 && <div>Showing 20 of {parsed.errors.length}.</div>}
              </Notice>
            )}
            <p className="sub-muted" aria-label="Validation counts">
              Validation: {counts.error} {counts.error === 1 ? 'error' : 'errors'}, {counts.warning} {counts.warning === 1 ? 'warning' : 'warnings'}, {counts.info} info
            </p>
            {issues.length > 0 && (
              <>
                <ul className="sub-issues">
                  {issues.slice(0, ISSUE_LIST).map((is, k) => (
                    <li key={k}>
                      <span>
                        <strong>{is.severity === 'error' ? 'Error' : is.severity === 'warning' ? 'Warning' : 'Info'}:</strong> {is.message}
                      </span>
                      <Button size="sm" onClick={() => jumpTo(is.index)}>
                        Jump to cue {is.index + 1}
                      </Button>
                    </li>
                  ))}
                </ul>
                {issues.length > ISSUE_LIST && <p className="sub-muted">Showing {ISSUE_LIST} of {issues.length} issues.</p>}
              </>
            )}
          </section>

          <section className="sub-section" aria-labelledby="sub-find-h">
            <h2 id="sub-find-h">Find and replace</h2>
            <div className="sub-row">
              <Field label="Find text" hint="Filters the list below. Replace changes every cue that matches.">
                {(a) => <input {...a} className="pk-input" type="text" value={st.query} onChange={(e) => setSt({ query: e.target.value, page: 0 })} />}
              </Field>
              <Field label="Replace with">
                {(a) => <input {...a} className="pk-input" type="text" value={st.replaceWith} onChange={(e) => setSt({ replaceWith: e.target.value })} />}
              </Field>
            </div>
            <div className="sub-row">
              <label className="pk-check">
                <input type="checkbox" checked={st.matchCase} onChange={(e) => setSt({ matchCase: e.target.checked })} />
                Match case
              </label>
              <span className="sub-muted">
                {st.query === '' ? 'Type text to find.' : `${matches.length} ${matches.length === 1 ? 'cue matches' : 'cues match'} the filter.`}
              </span>
            </div>
            <p className="sub-muted" role="status">
              {st.query === '' ? '' : `Would change ${replaced.changed} ${replaced.changed === 1 ? 'cue' : 'cues'}.`}
            </p>
            <div className="sub-actions">
              <Button
                onClick={() => {
                  commit(replaced.cues);
                }}
                disabled={st.query === '' || replaced.changed === 0}
              >
                Replace in all cues
              </Button>
            </div>
          </section>

          <section className="sub-section" aria-labelledby="sub-edit-h">
            <h2 id="sub-edit-h">Cues</h2>
            <div className="sub-actions" role="group" aria-label="History">
              <Button onClick={() => write(undo(hist))} disabled={!canUndo(hist)}>
                Undo
              </Button>
              <Button onClick={() => write(redo(hist))} disabled={!canRedo(hist)}>
                Redo
              </Button>
              <span className="sub-muted">{hist.index} undo {hist.index === 1 ? 'step' : 'steps'} available</span>
            </div>
            {st.note && <Notice kind="warn">{st.note}</Notice>}
            <div className="sub-pager" aria-label="Cue pages">
              <span>
                {matches.length === 0 ? 'No cues to show.' : `Cues ${page * PAGE + 1}-${Math.min(matches.length, page * PAGE + PAGE)} of ${matches.length}`}
              </span>
              <span className="sub-actions">
                <Button size="sm" onClick={() => setSt({ page: page - 1 })} disabled={page <= 0}>
                  Previous 100
                </Button>
                <Button size="sm" onClick={() => setSt({ page: page + 1 })} disabled={page >= pages - 1}>
                  Next 100
                </Button>
              </span>
            </div>
            <div className="sub-scroll" role="region" aria-label="Cue table" tabIndex={0}>
              <table className="sub-table">
                <caption className="sr-only">Cues, one row per cue</caption>
                <thead>
                  <tr>
                    <th scope="col">Select</th>
                    <th scope="col">Cue</th>
                    <th scope="col">Start</th>
                    <th scope="col">End</th>
                    <th scope="col">Text</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => (
                    <CueRow
                      key={i}
                      index={i}
                      cue={cues[i] as Cue}
                      selected={st.selected.includes(i)}
                      isLast={i === cues.length - 1}
                      onSelect={(on) => setSt({ selected: on ? [...st.selected, i] : st.selected.filter((x) => x !== i) })}
                      onEdit={(patch) => commit(editCue(cues, i, patch))}
                      onInsert={() => tryStructural(() => insertAfter(cues, i))}
                      onDelete={() => tryStructural(() => deleteCue(cues, i))}
                      onMerge={() => tryStructural(() => mergeWithNext(cues, i))}
                      onSplit={() => tryStructural(() => splitCue(cues, i, splitPct))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Optional sources, kept below the editor so an open file is not pushed down the page. */}
      <ExtractTracks hasCues={cues.length > 0} onApply={applyTranscript} />

      <Transcribe hasCues={cues.length > 0} onApply={applyTranscript} />
    </ToolPage>
  );
}

type RowProps = {
  index: number;
  cue: Cue;
  selected: boolean;
  isLast: boolean;
  onSelect: (on: boolean) => void;
  onEdit: (patch: Partial<Pick<Cue, 'start' | 'end' | 'text'>>) => void;
  onInsert: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onSplit: () => void;
};

function CueRow({ index, cue, selected, isLast, onSelect, onEdit, onInsert, onDelete, onMerge, onSplit }: RowProps) {
  const n = index + 1;
  return (
    <tr>
      <td>
        <label className="pk-check">
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
          <span className="sr-only">Select cue {n}</span>
        </label>
      </td>
      <th scope="row">{n}</th>
      <td>
        <TimeField key={cue.start} id={`sub-start-${index}`} label={`Start of cue ${n}`} value={cue.start} onCommit={(ms) => onEdit({ start: ms })} />
      </td>
      <td>
        <TimeField key={cue.end} id={`sub-end-${index}`} label={`End of cue ${n}`} value={cue.end} onCommit={(ms) => onEdit({ end: ms })} />
      </td>
      <td>
        <TextField key={cue.text} label={`Text of cue ${n}`} value={cue.text} onCommit={(t) => onEdit({ text: t })} />
      </td>
      <td>
        <div className="sub-cell-actions">
          <Button size="sm" onClick={onInsert}>
            Insert after<span className="sr-only"> cue {n}</span>
          </Button>
          <Button size="sm" onClick={onSplit}>
            Split<span className="sr-only"> cue {n}</span>
          </Button>
          <Button size="sm" onClick={onMerge} disabled={isLast}>
            Merge with next<span className="sr-only"> cue {n}</span>
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete<span className="sr-only"> cue {n}</span>
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** The value is read at blur time. An invalid time shows an error and leaves the cue unchanged. */
function TimeField({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (ms: number) => void }) {
  const [error, setError] = useState<string | null>(null);
  const errId = `${id}-err`;
  const commit = (raw: string) => {
    const ms = parseTime(raw);
    if (ms === null) {
      setError('Use HH:MM:SS.mmm, for example 00:01:02.500. The time was not changed.');
      return;
    }
    setError(null);
    if (ms !== value) onCommit(ms);
  };
  return (
    <>
      <input
        id={id}
        type="text"
        className="pk-input"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        defaultValue={formatTime(value, '.')}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget.value);
        }}
      />
      {error && (
        <p id={errId} className="sub-err">
          {error}
        </p>
      )}
    </>
  );
}

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (text: string) => void }) {
  return (
    <textarea
      className="pk-textarea"
      aria-label={label}
      rows={2}
      defaultValue={value}
      onBlur={(e) => {
        if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
      }}
    />
  );
}
