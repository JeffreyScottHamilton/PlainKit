import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { useAssets, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { inspectSignPdf, type PageGeom } from '@/engines/sign-pdf/inspect';
import { signInWorker } from '@/engines/sign-pdf/client';
import { DATE_FORMATS, formatDate, type DateFormat } from '@/engines/sign-pdf/date';
import { applyPatch, describeItem, newMarkItem, newTextItem, newVectorItem, type Patch } from '@/engines/sign-pdf/items';
import type { Item, Mark } from '@/engines/sign-pdf/types';
import { toToolError } from '@/lib/errors';
import { outputName, uid } from '@/lib/format';
import { blobUrl, openSignDoc } from './render';
import { PageView } from './PageView';
import { SignaturePanel, type MarkLabel } from './SignaturePanel';
import './sign-pdf.css';

type Saved = Mark & { url: string };
type Stored = {
  /** Asset id the items were placed on. Items reset when another PDF becomes the active one. */
  docId?: string;
  items: Item[];
  page: number;
  selected?: string;
  signature?: Saved;
  initials?: Saved;
  dateFormat: DateFormat;
};
const INITIAL: Stored = { items: [], page: 0, dateFormat: 'long' };

/** Page count of each export, keyed by its blob, so the result can show "Verified: N pages". */
const verified = new WeakMap<Blob, number>();
const clampSize = (v: number) => Math.min(200, Math.max(6, v));

export default function Tool() {
  const inputs = useToolInputs('sign-pdf');
  const liveAssets = useAssets();
  const src = inputs[inputs.length - 1];
  const srcId = src?.id;
  const srcBlob = src?.blob;
  const srcName = src?.name ?? '';
  const [st, set] = useToolState<Stored>('sign-pdf', INITIAL);
  const stRef = useRef(st);
  useEffect(() => {
    stRef.current = st;
  });
  const jobs = useJobs('sign-pdf');
  const [loaded, setLoaded] = useState<{ id: string; pdf: PDFDocumentProxy; geoms: PageGeom[] }>();
  const [error, setError] = useState<{ message: string; nextAction?: string }>();
  const [zoom, setZoom] = useState(1);
  const [fitW, setFitW] = useState(0);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const viewer = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLElement | null)[]>([]);

  // Checks the newest PDF (encrypted or broken files get a clear message), then opens it for drawing.
  useEffect(() => {
    setError(undefined);
    setLoaded(undefined);
    if (!srcId || !srcBlob) return;
    let alive = true;
    let close: (() => Promise<void>) | undefined;
    void (async () => {
      try {
        const geoms = await inspectSignPdf(new Uint8Array(await srcBlob.arrayBuffer()));
        const opened = await openSignDoc(srcBlob);
        close = opened.close;
        if (!alive) {
          void opened.close();
          return;
        }
        setLoaded({ id: srcId, pdf: opened.pdf, geoms });
      } catch (e) {
        if (!alive) return;
        const err = toToolError(e);
        setError({ message: err.message, nextAction: err.nextAction });
      }
    })();
    return () => {
      alive = false;
      void close?.();
    };
  }, [srcId, srcBlob]);

  useEffect(() => {
    if (loaded && stRef.current.docId !== loaded.id) set({ docId: loaded.id, items: [], page: 0, selected: undefined });
  }, [loaded, set]);

  const showDoc = !!loaded && st.docId === loaded.id;
  useEffect(() => {
    const el = viewer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFitW(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showDoc]);

  const pdf = showDoc && loaded ? loaded.pdf : undefined;
  const geoms = showDoc && loaded ? loaded.geoms : [];
  const pageCount = geoms.length;
  const maxW = Math.max(1, ...geoms.map((g) => g.width));
  const pxPerPt = (Math.max(180, fitW - 32) / maxW) * zoom;
  const selected = st.items.find((i) => i.id === st.selected);

  const update = (id: string, patch: Patch) => set((s) => ({ ...s, items: s.items.map((it) => (it.id === id ? applyPatch(it, patch) : it)) }));
  const remove = (id: string) => {
    set((s) => ({ ...s, items: s.items.filter((it) => it.id !== id), selected: s.selected === id ? undefined : s.selected }));
    setStatus('Item deleted.');
  };
  const select = (id?: string) => set({ selected: id });

  const addItem = (make: (id: string, page: number, w: number, h: number) => Item, label: string) => {
    const page = stRef.current.page;
    const g = geoms[page];
    if (!g) return;
    const it = make(uid(), page, g.width, g.height);
    set((s) => ({ ...s, items: [...s.items, it], selected: it.id }));
    setStatus(`${label} added to page ${page + 1}.`);
  };

  const saveMark = (label: MarkLabel, mark: Mark) => {
    const saved: Saved = { ...mark, url: blobUrl(mark.blob) };
    set(label === 'Signature' ? { signature: saved } : { initials: saved });
    setStatus(`${label} saved. It stays for this session.`);
  };
  const placeSaved = (label: MarkLabel) => {
    const m = label === 'Signature' ? st.signature : st.initials;
    if (m) addItem((id, p, w, h) => newMarkItem(id, label, m, p, w, h), label);
  };

  const goTo = (i: number) => {
    const n = Math.min(Math.max(0, i), Math.max(0, pageCount - 1));
    set({ page: n });
    pageEls.current[n]?.scrollIntoView({ block: 'start' });
  };
  const onScroll = () => {
    const root = viewer.current;
    if (!root) return;
    const top = root.getBoundingClientRect().top + 40;
    let idx = 0;
    pageEls.current.forEach((el, i) => {
      if (el && el.getBoundingClientRect().top <= top) idx = i;
    });
    if (idx !== stRef.current.page) set({ page: idx });
  };

  const exportPdf = () => {
    if (!showDoc || !srcId || !srcBlob) return;
    const items = st.items;
    const name = srcName;
    enqueue({
      toolId: 'sign-pdf',
      label: 'Sign PDF',
      inputIds: [srcId],
      heavy: true,
      run: async (ctx) => {
        const r = await signInWorker(srcBlob, items, ctx);
        const blob = new Blob([r.bytes as BlobPart], { type: 'application/pdf' });
        verified.set(blob, r.pageCount);
        const warnings = r.dropped
          ? [`${r.dropped} ${r.dropped === 1 ? 'character is' : 'characters are'} outside the standard PDF text set and were written as "?".`]
          : [];
        return { outputs: [{ name: outputName(name, 'signed', 'pdf'), mime: 'application/pdf', blob }], warnings };
      },
    });
    setStatus('Signing started.');
  };

  const liveIds = new Set(liveAssets.map((a) => a.id));
  const jobList = jobs.filter((j) => isActive(j) || j.state === 'failed' || j.state === 'canceled');
  const results = jobs.flatMap((j) => (j.state === 'complete' && j.result ? j.result.assets : [])).filter((a) => liveIds.has(a.id));

  return (
    <ToolPage
      toolId="sign-pdf"
      settings={
        <div className="pk-stack">
          <SignaturePanel onSaved={saveMark} />

          <section aria-labelledby="sp-saved-h" className="sp-block">
            <h3 id="sp-saved-h">Saved for this session</h3>
            {(['Signature', 'Initials'] as const).map((label) => {
              const m = label === 'Signature' ? st.signature : st.initials;
              return (
                <div key={label} className="sp-saved">
                  {m ? <img src={m.url} alt={`Saved ${label.toLowerCase()}`} className="sp-saved__img" /> : <span className="muted">No {label.toLowerCase()} saved yet.</span>}
                  <Button size="sm" disabled={!m || !showDoc} onClick={() => placeSaved(label)}>
                    Place {label.toLowerCase()}
                  </Button>
                </div>
              );
            })}
          </section>

          <section aria-labelledby="sp-add-h" className="sp-block">
            <h3 id="sp-add-h">Add to page {st.page + 1}</h3>
            <Field label="Text" hint="Standard PDF text. Characters outside Latin-1 and Windows-1252 become ?.">
              {(p) => <input {...p} type="text" className="pk-input" value={draft} onChange={(e) => setDraft(e.target.value)} />}
            </Field>
            <div className="sp-row">
              <Button size="sm" disabled={!showDoc || !draft.trim()} onClick={() => addItem((id, p, w, h) => newTextItem(id, 'text', draft.trim(), p, w, h), 'Text')}>
                Add text
              </Button>
            </div>
            <Segmented label="Date format" value={st.dateFormat} options={DATE_FORMATS} onChange={(dateFormat) => set({ dateFormat })} />
            <div className="sp-row">
              <Button
                size="sm"
                disabled={!showDoc}
                onClick={() => addItem((id, p, w, h) => newTextItem(id, 'date', formatDate(new Date(), st.dateFormat), p, w, h), 'Date')}
              >
                Add today's date
              </Button>
            </div>
            <div className="sp-row">
              <Button size="sm" disabled={!showDoc} onClick={() => addItem((id, p, w, h) => newVectorItem(id, 'check', p, w, h), 'Check mark')}>
                Check mark
              </Button>
              <Button size="sm" disabled={!showDoc} onClick={() => addItem((id, p, w, h) => newVectorItem(id, 'cross', p, w, h), 'Cross mark')}>
                Cross mark
              </Button>
            </div>
          </section>

          {selected && (
            <section aria-labelledby="sp-sel-h" className="sp-block">
              <h3 id="sp-sel-h">Selected item</h3>
              <p className="muted sp-note">{describeItem(selected)}</p>
              {(selected.kind === 'text' || selected.kind === 'date') && (
                <Field label="Item text">
                  {(p) => <input {...p} type="text" className="pk-input" value={selected.text} onChange={(e) => update(selected.id, { text: e.target.value })} />}
                </Field>
              )}
              {selected.kind !== 'image' && (
                <Field label="Size (pt)">
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      className="pk-input"
                      min={6}
                      max={200}
                      step={1}
                      value={Math.round(selected.size)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (e.target.value !== '' && Number.isFinite(v)) update(selected.id, { size: clampSize(v) });
                      }}
                    />
                  )}
                </Field>
              )}
              <p className="muted sp-note">Drag to move. Drag the corner handle, or press + and - to resize. Arrow keys nudge by 1 point (10 with Shift). Delete removes it.</p>
              <Button variant="danger" size="sm" onClick={() => remove(selected.id)}>
                <Trash2 aria-hidden /> Delete item
              </Button>
            </section>
          )}

          <Button variant="primary" block disabled={!showDoc || !st.items.length} onClick={exportPdf}>
            Sign and export PDF
          </Button>
          <p className="muted sp-note">The original file is never changed. The signed copy is a new PDF.</p>
          <p className="muted sp-note">This is a picture of a signature, not a certified digital signature.</p>
        </div>
      }
    >
      <DropZone toolId="sign-pdf" multiple={false} compact={!!src} hint="Add one PDF. The newest file is the one you sign. Nothing is uploaded." />

      {src && (
        <ul className="pk-assets">
          <AssetRow asset={src} exclude="sign-pdf" detail={error ? 'Not opened' : showDoc ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : 'Opening'} />
        </ul>
      )}

      {error && (
        <Notice kind="error">
          <strong>{error.message}</strong>
          {error.nextAction && <div>{error.nextAction}</div>}
        </Notice>
      )}
      {src && !error && !showDoc && (
        <p className="muted" role="status">
          Opening PDF…
        </p>
      )}

      {showDoc && pdf && (
        <section aria-labelledby="sp-doc-h" className="sp-doc">
          <h2 id="sp-doc-h">Document</h2>
          <div className="sp-bar" role="toolbar" aria-label="Page navigation and zoom">
            <Button size="sm" disabled={st.page <= 0} onClick={() => goTo(st.page - 1)}>
              <ChevronLeft aria-hidden /> Previous page
            </Button>
            <span aria-live="polite">
              Page {st.page + 1} of {pageCount}
            </span>
            <Button size="sm" disabled={st.page >= pageCount - 1} onClick={() => goTo(st.page + 1)}>
              Next page <ChevronRight aria-hidden />
            </Button>
            <Button size="sm" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
              <ZoomOut aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setZoom(1)}>
              Fit width
            </Button>
            <Button size="sm" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
              <ZoomIn aria-hidden />
            </Button>
          </div>
          <div ref={viewer} className="sp-viewer" role="region" aria-label="Document pages" tabIndex={0} onScroll={onScroll}>
            {geoms.map((g, i) => (
              <PageView
                key={i}
                pdf={pdf}
                index={i}
                geom={g}
                pxPerPt={pxPerPt}
                items={st.items}
                selected={st.selected}
                wrapRef={(el) => {
                  pageEls.current[i] = el;
                }}
                onSelect={select}
                onPatch={update}
                onDelete={remove}
              />
            ))}
          </div>
          <p role="status" className="muted sp-note">
            {status}
          </p>
        </section>
      )}

      {jobList.map((j) => (
        <JobStatus key={j.id} job={j} />
      ))}

      {results.length > 0 && (
        <section aria-labelledby="sp-results-h" className="sp-doc">
          <h2 id="sp-results-h">Results</h2>
          <ul className="pk-assets">
            {results.map((a) => {
              const n = verified.get(a.blob);
              return <AssetRow key={a.id} asset={a} exclude="sign-pdf" detail={n === undefined ? undefined : `Verified: ${n} pages`} />;
            })}
          </ul>
        </section>
      )}
    </ToolPage>
  );
}
