import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Redo2, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice } from '@/components/ui';
import { getAsset, session, useAssets, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { inspectPdf } from '@/engines/pdf/load';
import { exportPages } from '@/engines/pdf/client';
import * as M from '@/engines/pdf/model';
import { toToolError } from '@/lib/errors';
import { outputName, uid } from '@/lib/format';
import { PageTile } from './PageGrid';
import { releaseDocs } from './thumbs';
import './pdf.css';

type SourceInfo = { name: string; pageCount: number; error?: { message: string; nextAction?: string } };
type Stored = {
  sources: Record<string, SourceInfo>;
  history: M.History;
  selected: string[];
  rangeText: string;
  outputBase: string;
};
const INITIAL: Stored = { sources: {}, history: M.createHistory(), selected: [], rangeText: '', outputBase: '' };

/** Page count of each export, keyed by its blob, so the result can show "Verified: N pages". */
const verified = new WeakMap<Blob, number>();

async function inspectSource(blob: Blob, name: string): Promise<{ source: SourceInfo; count: number }> {
  try {
    const info = await inspectPdf(new Uint8Array(await blob.arrayBuffer()));
    return { source: { name, pageCount: info.pageCount }, count: info.pageCount };
  } catch (e) {
    const err = toToolError(e);
    return { source: { name, pageCount: 0, error: { message: err.message, nextAction: err.nextAction } }, count: 0 };
  }
}

const isTextTarget = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type);
};

export default function Tool() {
  const inputs = useToolInputs('pdf');
  const liveAssets = useAssets();
  const [st, set] = useToolState<Stored>('pdf', INITIAL);
  const jobs = useJobs('pdf');
  const [status, setStatus] = useState('');
  const stRef = useRef(st);
  const handled = useRef(new Set<string>());
  const ingesting = useRef(false);

  useEffect(() => {
    stRef.current = st;
  });
  useEffect(() => () => releaseDocs(), []);

  // Inspect each newly added file in order and append its pages (sequential, so file order holds).
  useEffect(() => {
    if (ingesting.current) return;
    ingesting.current = true;
    void (async () => {
      try {
        for (;;) {
          const id = (session.get().inputs.pdf ?? []).find((i) => !handled.current.has(i) && !stRef.current.sources[i]);
          if (!id) break;
          handled.current.add(id);
          const asset = getAsset(id);
          if (!asset) continue;
          const { source, count } = await inspectSource(asset.blob, asset.name);
          const refs = Array.from({ length: count }, (_, i): M.PageRef => ({ key: uid(), srcId: id, srcIndex: i, rotation: 0 }));
          set((s) => (s.sources[id] ? s : { ...s, sources: { ...s.sources, [id]: source }, history: M.mapAll(s.history, (ps) => [...ps, ...refs]) }));
        }
      } finally {
        ingesting.current = false;
      }
    })();
  }, [inputs, set]);

  // Removing a file from the session drops its pages and selection everywhere in history.
  useEffect(() => {
    const live = new Set(inputs.map((a) => a.id));
    set((s) => {
      const gone = new Set(Object.keys(s.sources).filter((id) => !live.has(id)));
      if (!gone.size) return s;
      const sources = Object.fromEntries(Object.entries(s.sources).filter(([id]) => !gone.has(id)));
      return { ...s, sources, history: M.mapAll(s.history, (ps) => ps.filter((p) => !gone.has(p.srcId))) };
    });
  }, [inputs, set]);

  // Undo / redo shortcuts while focus is not in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoAction();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redoAction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pages = st.history.present;
  const keys = useMemo(() => new Set(pages.map((p) => p.key)), [pages]);
  const selected = st.selected.filter((k) => keys.has(k));
  const selSet = new Set(selected);
  const blobs = useMemo(() => new Map(inputs.map((a) => [a.id, a.blob])), [inputs]);
  const sourceName = (id: string) => st.sources[id]?.name ?? 'Unknown file';
  const sourceCount = new Set(pages.map((p) => p.srcId)).size;
  const total = pages.length;
  const liveIds = new Set(liveAssets.map((a) => a.id));
  const results = jobs.flatMap((j) => (j.state === 'complete' && j.result ? j.result.assets : [])).filter((a) => liveIds.has(a.id));

  const rangeParsed = st.rangeText.trim() ? M.parseRanges(st.rangeText, total) : null;
  const rangeError = rangeParsed && !rangeParsed.ok ? rangeParsed.error : undefined;

  const edit = (f: (ps: M.PageRef[]) => M.PageRef[]) => set((s) => ({ ...s, history: M.commit(s.history, f(s.history.present)) }));
  function undoAction() {
    set((s) => ({ ...s, history: M.undo(s.history) }));
    setStatus('Undone.');
  }
  function redoAction() {
    set((s) => ({ ...s, history: M.redo(s.history) }));
    setStatus('Redone.');
  }
  const toggle = (key: string) => set((s) => ({ ...s, selected: s.selected.includes(key) ? s.selected.filter((k) => k !== key) : [...s.selected, key] }));
  const moveTile = (from: number, to: number) => {
    edit((ps) => M.move(ps, from, to));
    setStatus(`Page moved to position ${to + 1}`);
  };
  const moveSelected = (to: number) => {
    edit((ps) => M.moveMany(ps, selected, to));
    setStatus(`${selected.length} ${selected.length === 1 ? 'page' : 'pages'} moved to position ${to + 1}`);
  };
  const rotateSelected = (delta: number) => {
    edit((ps) => M.rotate(ps, selected, delta));
    setStatus(`${selected.length} ${selected.length === 1 ? 'page' : 'pages'} rotated ${delta < 0 ? 'left' : 'right'}`);
  };
  const removeSelected = () => {
    const n = selected.length;
    edit((ps) => M.remove(ps, selected));
    set({ selected: [] });
    setStatus(`${n} ${n === 1 ? 'page' : 'pages'} removed`);
  };
  const onRange = (text: string) => {
    const parsed = text.trim() ? M.parseRanges(text, total) : null;
    set({ rangeText: text, ...(parsed?.ok ? { selected: parsed.indices.map((i) => pages[i]!.key) } : {}) });
  };

  const runExport = (ps: M.PageRef[], label: string, suffix: string, firstSrc: string) => {
    const ids = [...new Set(ps.map((p) => p.srcId))];
    const sources = ids.flatMap((id) => {
      const blob = blobs.get(id);
      return blob ? [{ id, blob }] : [];
    });
    const name = outputName(st.outputBase.trim() || firstSrc, suffix, 'pdf');
    enqueue({
      toolId: 'pdf',
      label,
      inputIds: ids,
      heavy: true,
      run: async (ctx) => {
        const res = await exportPages(ps, sources, ctx);
        const blob = new Blob([res.bytes as BlobPart], { type: 'application/pdf' });
        verified.set(blob, res.pageCount);
        return { outputs: [{ name, mime: 'application/pdf', blob }] };
      },
    });
  };
  const exportAll = () => runExport(pages, 'Export PDF', sourceCount > 1 ? 'merged' : 'edited', sourceName(pages[0]!.srcId));
  const extractSelected = () => {
    const picked = pages.filter((p) => selSet.has(p.key));
    runExport(picked, 'Extract selected', 'extracted', sourceName(picked[0]!.srcId));
  };

  const jobList = jobs.filter((j) => isActive(j) || j.state === 'failed' || j.state === 'canceled');

  return (
    <ToolPage
      toolId="pdf"
      settings={
        <div className="pk-stack">
          <Field label="File name" hint="Optional. Leave empty to use the first file's name.">
            {(p) => <input {...p} type="text" className="pk-input" value={st.outputBase} onChange={(e) => set({ outputBase: e.target.value })} />}
          </Field>
          <Button variant="primary" block disabled={!total} onClick={exportAll}>
            Export PDF
          </Button>
          <Button block disabled={!selected.length} onClick={extractSelected}>
            Extract selected
          </Button>
          <p className="muted pdf-note">Pages are copied, not re-rendered: text stays selectable.</p>
          <p className="muted pdf-note">Editing a PDF invalidates any digital signatures.</p>
        </div>
      }
    >
      <DropZone toolId="pdf" compact={inputs.length > 0} hint="PDFs are merged in the order added. Nothing is uploaded." />

      {inputs.length > 0 && (
        <section aria-labelledby="pdf-files-h" className="pdf-section">
          <h2 id="pdf-files-h">Files</h2>
          <ul className="pk-assets">
            {inputs.map((a) => {
              const s = st.sources[a.id];
              return <AssetRow key={a.id} asset={a} exclude="pdf" detail={s ? (s.error ? 'Not added' : `${s.pageCount} pages`) : 'Checking'} />;
            })}
          </ul>
          {inputs.map((a) => {
            const e = st.sources[a.id]?.error;
            return e ? (
              <Notice key={a.id} kind="error">
                <strong>{e.message}</strong>
                <div>
                  {a.name} was not added. {e.nextAction}
                </div>
              </Notice>
            ) : null;
          })}
        </section>
      )}

      {total > 0 ? (
        <section aria-labelledby="pdf-pages-h" className="pdf-section">
          <h2 id="pdf-pages-h">Pages</h2>
          <div className="pdf-bar" role="toolbar" aria-label="Page actions">
            <span className="muted">
              {total} {total === 1 ? 'page' : 'pages'}
              {selected.length ? ` · ${selected.length} selected` : ''}
            </span>
            <Button size="sm" disabled={!selected.length} onClick={() => moveSelected(0)}>
              <ChevronsLeft aria-hidden /> Move to start
            </Button>
            <Button size="sm" disabled={!selected.length} onClick={() => moveSelected(total - selected.length)}>
              <ChevronsRight aria-hidden /> Move to end
            </Button>
            <Button size="sm" disabled={!selected.length} onClick={() => rotateSelected(-90)}>
              <RotateCcw aria-hidden /> Rotate left
            </Button>
            <Button size="sm" disabled={!selected.length} onClick={() => rotateSelected(90)}>
              <RotateCw aria-hidden /> Rotate right
            </Button>
            <Button size="sm" variant="danger" disabled={!selected.length} onClick={removeSelected}>
              <Trash2 aria-hidden /> Remove
            </Button>
            <Button size="sm" disabled={!st.history.past.length} onClick={undoAction}>
              <Undo2 aria-hidden /> Undo
            </Button>
            <Button size="sm" disabled={!st.history.future.length} onClick={redoAction}>
              <Redo2 aria-hidden /> Redo
            </Button>
          </div>
          <Field label="Select range" hint="Page numbers in the current order, such as 1-3,5 or 8-." error={rangeError}>
            {(p) => <input {...p} type="text" className="pk-input pdf-range" value={st.rangeText} onChange={(e) => onRange(e.target.value)} />}
          </Field>
          <ol className="pdf-grid" aria-label="Pages">
            {pages.map((page, i) => (
              <PageTile
                key={page.key}
                t={{ page, pos: i + 1, name: sourceName(page.srcId), blob: blobs.get(page.srcId), selected: selSet.has(page.key) }}
                total={total}
                onToggle={toggle}
                onMove={moveTile}
              />
            ))}
          </ol>
        </section>
      ) : (
        <p className="muted">No pages yet. Add PDF files above. Pages from each file are appended in the order added.</p>
      )}

      {jobList.map((j) => (
        <JobStatus key={j.id} job={j} />
      ))}

      {results.length > 0 && (
        <section aria-labelledby="pdf-results-h" className="pdf-section">
          <h2 id="pdf-results-h">Results</h2>
          <ul className="pk-assets">
            {results.map((a) => {
              const n = verified.get(a.blob);
              return <AssetRow key={a.id} asset={a} exclude="pdf" detail={n === undefined ? undefined : `Verified: ${n} pages`} />;
            })}
          </ul>
        </section>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </ToolPage>
  );
}
