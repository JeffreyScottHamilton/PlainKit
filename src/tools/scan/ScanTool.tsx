import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowUp, Camera, RotateCcw, RotateCw, X } from 'lucide-react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { JobResult } from '@/components/JobResult';
import { Button, Notice, Segmented } from '@/components/ui';
import { addFiles, assetUrl, removeInput, setInputs, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { enqueue, useJobs } from '@/jobs/queue';
import type { EngineOutput } from '@/jobs/types';
import { formatBytes, outputName } from '@/lib/format';
import { buildPdf, type PdfPage } from '@/engines/scan/pdf';
import { detectCorners, renderPage } from '@/engines/scan/client';
import { fullPageQuad } from '@/engines/scan/corners';
import type { Filter, PageFormat, PageSizeChoice, Quad, Turns } from '@/engines/scan/types';
import { CornerStage } from './CornerStage';
import './scan.css';

/** Export choice: one PDF, or one picture per page. */
type ExportChoice = 'pdf' | PageFormat;

type ScanState = {
  selectedId: string | null;
  quads: Record<string, Quad>;
  found: Record<string, boolean>;
  turns: Record<string, Turns>;
  filter: Filter;
  size: PageSizeChoice;
  format: ExportChoice;
  jobId: string | null;
};

const INITIAL: ScanState = { selectedId: null, quads: {}, found: {}, turns: {}, filter: 'enhanced', size: 'fit', format: 'pdf', jobId: null };
const FULL_QUAD: Quad = fullPageQuad();
const PREVIEW_SIDE = 900;
const EXPORT_SIDE = 2200;
const PREVIEW_DELAY_MS = 250;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'original', label: 'Original colour' },
  { value: 'enhanced', label: 'Enhanced' },
  { value: 'bw', label: 'Black & white' },
  { value: 'gray', label: 'Grayscale' },
];
const SIZES: { value: PageSizeChoice; label: string }[] = [
  { value: 'fit', label: 'Fit to content' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
];
const FORMATS: { value: ExportChoice; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
];

type Preview = { url: string; width: number; height: number };

export default function ScanTool() {
  const allInputs = useToolInputs('scan');
  const pages = useMemo(() => allInputs.filter((a) => a.mime.startsWith('image/')), [allInputs]);
  const [st, set] = useToolState<ScanState>('scan', INITIAL);
  const jobs = useJobs('scan');
  const selected = pages.find((a) => a.id === st.selectedId) ?? pages[0];
  const selectedIndex = selected ? pages.indexOf(selected) : -1;

  const quad: Quad = selected ? (st.quads[selected.id] ?? FULL_QUAD) : FULL_QUAD;
  const turns: Turns = selected ? (st.turns[selected.id] ?? 0) : 0;
  const hasQuad = selected ? st.quads[selected.id] !== undefined : true;
  const job = jobs.find((j) => j.id === st.jobId);
  const busy = job !== undefined && (job.state === 'queued' || job.state === 'running');

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const asked = useRef(new Set<string>());
  const detecting = useRef(new Map<string, AbortController>());

  // Corner detection runs once per photo, when it is first shown. Duplicates are blocked by `asked`.
  useEffect(() => {
    if (!selected || hasQuad || asked.current.has(selected.id)) return;
    const id = selected.id;
    const blob = selected.blob;
    const ctl = new AbortController();
    asked.current.add(id);
    detecting.current.set(id, ctl);
    detectCorners(blob, ctl.signal)
      .then((r) => {
        if (ctl.signal.aborted) return;
        setDetectError(null);
        set((s) => ({ ...s, quads: { ...s.quads, [id]: r.quad }, found: { ...s.found, [id]: r.detected } }));
      })
      .catch(() => {
        if (ctl.signal.aborted) return;
        setDetectError('Corner detection failed. The full image is used; drag the corners to fit the page.');
        set((s) => ({ ...s, quads: { ...s.quads, [id]: FULL_QUAD }, found: { ...s.found, [id]: false } }));
      })
      .finally(() => detecting.current.delete(id));
  }, [selected, hasQuad, set]);

  useEffect(
    () => () => {
      detecting.current.forEach((c) => c.abort());
      detecting.current.clear();
      asked.current.clear();
    },
    [],
  );

  // Live preview: debounced, and the previous render is aborted when the settings change again.
  useEffect(() => {
    if (!selected) return;
    const blob = selected.blob;
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      renderPage(blob, { quad, turns, filter: st.filter, format: 'image/jpeg', maxSide: PREVIEW_SIDE }, ctl.signal)
        .then((r) => {
          const url = URL.createObjectURL(new Blob([new Uint8Array(r.bytes)], { type: r.mime }));
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
          previewUrl.current = url;
          setPreview({ url, width: r.width, height: r.height });
          setPreviewError(null);
        })
        .catch((e: unknown) => {
          if (ctl.signal.aborted) return;
          setPreviewError(e instanceof Error ? e.message : 'The preview could not be made.');
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [selected, quad, turns, st.filter]);

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const setQuad = (id: string, q: Quad) => set((s) => ({ ...s, quads: { ...s.quads, [id]: q }, found: { ...s.found, [id]: false } }));

  const rotate = (dir: 1 | 3) => {
    if (!selected) return;
    const id = selected.id;
    set((s) => ({ ...s, turns: { ...s.turns, [id]: (((s.turns[id] ?? 0) + dir) % 4) as Turns } }));
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= pages.length) return;
    const ids = pages.map((a) => a.id);
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    setInputs('scan', ids);
  };

  const removePage = (id: string) => {
    removeInput('scan', id);
    set((s) => ({ ...s, selectedId: s.selectedId === id ? null : s.selectedId }));
  };

  const onCamera = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list?.length) addFiles([...list], 'scan');
    e.target.value = '';
  };

  const exportPages = () => {
    if (pages.length === 0 || busy) return;
    const snap = { quads: st.quads, turns: st.turns, filter: st.filter, size: st.size, format: st.format };
    const inputs = pages.map((a) => ({ id: a.id, name: a.name, blob: a.blob }));
    const n = inputs.length;
    const id = enqueue({
      toolId: 'scan',
      label: `Scan ${n} ${n === 1 ? 'page' : 'pages'}`,
      inputIds: inputs.map((a) => a.id),
      heavy: true,
      run: async (ctx) => {
        const wantsPdf = snap.format === 'pdf';
        const picFormat: PageFormat = snap.format === 'pdf' ? 'image/jpeg' : snap.format;
        const outs: EngineOutput[] = [];
        const pdfPages: PdfPage[] = [];
        for (let i = 0; i < n; i++) {
          ctx.signal.throwIfAborted();
          const a = inputs[i]!;
          ctx.onProgress({ stage: 'processing', fraction: i / n, message: `Page ${i + 1} of ${n}` });
          const r = await renderPage(
            a.blob,
            { quad: snap.quads[a.id] ?? FULL_QUAD, turns: snap.turns[a.id] ?? 0, filter: snap.filter, format: picFormat, maxSide: EXPORT_SIDE },
            ctx.signal,
            ctx.onProgress,
          );
          if (wantsPdf) {
            pdfPages.push({ bytes: r.bytes, width: r.width, height: r.height });
          } else {
            const ext = r.mime === 'image/png' ? 'png' : 'jpg';
            const nn = String(i + 1).padStart(2, '0');
            outs.push({ name: outputName(a.name, `${nn}-scan`, ext), mime: r.mime, blob: new Blob([new Uint8Array(r.bytes)], { type: r.mime }) });
          }
        }
        ctx.onProgress({ stage: 'exporting', message: 'Writing the file' });
        const warnings: string[] = [];
        if (wantsPdf) {
          const bytes = await buildPdf(pdfPages, snap.size);
          outs.push({ name: outputName(inputs[0]!.name, 'scan', 'pdf'), mime: 'application/pdf', blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }) });
          warnings.push(`One PDF with ${n} ${n === 1 ? 'page' : 'pages'}, ${formatBytes(bytes.byteLength)}.`);
        }
        return { outputs: outs, warnings };
      },
    });
    set((s) => ({ ...s, jobId: id }));
  };

  const found = selected ? st.found[selected.id] : undefined;

  return (
    <ToolPage
      toolId="scan"
      settings={
        <div className="pk-stack">
          <h2>Output</h2>
          <Segmented<Filter> label="Cleanup" value={st.filter} options={FILTERS} onChange={(filter) => set({ filter })} />
          <Segmented<PageSizeChoice> label="Page size" value={st.size} options={SIZES} onChange={(size) => set({ size })} />
          <p className="muted">Page size applies to PDF only.</p>
          <Segmented<ExportChoice> label="Export as" value={st.format} options={FORMATS} onChange={(format) => set({ format })} />
          <Button variant="primary" block disabled={pages.length === 0 || busy} onClick={exportPages}>
            {st.format === 'pdf' ? 'Export PDF' : 'Export pages'}
          </Button>
          <JobResult job={job} exclude="scan" />
        </div>
      }
    >
      <div className="pk-stack">
        <DropZone toolId="scan" accept="image/*" hint="Photos of paper: JPEG, PNG, WebP, HEIC. Each photo becomes one page." />
        <div className="scan-actions">
          <Button onClick={() => cameraInput.current?.click()}>
            <Camera size={16} aria-hidden="true" /> Take photo
          </Button>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onCamera} aria-label="Take a photo of a page" />
        </div>

        {pages.length === 0 && <p className="muted">No pages yet. Add a photo to start.</p>}

        {pages.length > 0 && (
          <>
            <ol className="scan-pages" aria-label="Pages in order">
              {pages.map((a, i) => (
                <li key={a.id} className="scan-page" data-selected={a.id === selected?.id}>
                  <button type="button" className="scan-page__pick" aria-pressed={a.id === selected?.id} onClick={() => set({ selectedId: a.id })}>
                    <img className="scan-thumb" src={assetUrl(a)} alt="" />
                    <span className="scan-page__index">{i + 1}</span>
                    <span className="scan-page__name">{a.name}</span>
                  </button>
                  <div className="scan-page__actions">
                    <Button size="sm" variant="ghost" aria-label={`Move page ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp size={16} aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Move page ${i + 1} down`} disabled={i === pages.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown size={16} aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove page ${i + 1}`} onClick={() => removePage(a.id)}>
                      <X size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>

            {selected && (
              <>
                {found === true && <Notice kind="success">Page edges found. Check the corners, or drag them to adjust.</Notice>}
                {found === false && hasQuad && !detectError && (
                  <Notice kind="warn">Could not find the page edges, so the full image is used. Drag the corners onto the page.</Notice>
                )}
                {detectError && <Notice kind="error">{detectError}</Notice>}

                <div className="scan-stage-grid">
                  <div className="pk-stack">
                    <p className="muted">Page {selectedIndex + 1}: drag the corners, or focus one and use the arrow keys (Shift for larger steps).</p>
                    <CornerStage src={assetUrl(selected)} name={`page ${selectedIndex + 1}`} quad={quad} onCommit={(q) => setQuad(selected.id, q)} />
                    <div className="scan-actions">
                      <Button onClick={() => setQuad(selected.id, FULL_QUAD)}>Reset to full image</Button>
                      <Button aria-label="Rotate page left" onClick={() => rotate(3)}>
                        <RotateCcw size={16} aria-hidden="true" /> Rotate left
                      </Button>
                      <Button aria-label="Rotate page right" onClick={() => rotate(1)}>
                        <RotateCw size={16} aria-hidden="true" /> Rotate right
                      </Button>
                    </div>
                  </div>

                  <figure className="scan-result" aria-live="polite">
                    <div className="scan-result__frame">
                      {preview ? (
                        <img src={preview.url} alt={`Preview of page ${selectedIndex + 1} after corners, rotation and cleanup`} width={preview.width} height={preview.height} />
                      ) : (
                        <span className="muted">Preparing preview…</span>
                      )}
                    </div>
                    <figcaption>Preview. Export uses higher resolution.</figcaption>
                    {previewError && <Notice kind="error">{previewError}</Notice>}
                  </figure>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ToolPage>
  );
}
