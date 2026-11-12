import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow, downloadAsset } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { removeAsset, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import { outputName, uid } from '@/lib/format';
import { renderRedactedInWorker } from '@/engines/redact/client';
import { commit, newHistory, redo, undo, updateRegion, addRegion, removeRegion, centeredRect, clampRect, describeRegion, keyEdit, makeRegion, rectFromPoints, resizeFromCorner, type Corner, type History, type Rect, type Region, type RedactStyle } from '@/engines/redact/model';
import { fitLayout, toImage, toPreview } from '@/engines/redact/coords';
import type { RenderFormat } from '@/engines/redact/types';
import './redact.css';

type Stored = {
  docs: Record<string, History>;
  selected: Record<string, string | null>;
  style: RedactStyle;
  color: string;
  format: RenderFormat;
  jobByInput: Record<string, string>;
};
const INITIAL: Stored = { docs: {}, selected: {}, style: 'solid', color: '#000000', format: 'image/png', jobByInput: {} };
const EMPTY = newHistory();
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

type Img = { bitmap: ImageBitmap; width: number; height: number };
type Gesture =
  | { kind: 'move'; id: string; start: Region; from: { x: number; y: number } }
  | { kind: 'resize'; id: string; corner: Corner; start: Region }
  | { kind: 'create'; anchor: { x: number; y: number } };

/** Decodes the preview once per asset (orientation applied). Closed when replaced or unmounted. */
function useImage(asset: SessionAsset | undefined): { img?: Img; error?: string } {
  const [state, setState] = useState<{ img?: Img; error?: string; for?: Blob }>({});
  useEffect(() => {
    if (!asset) return;
    let alive = true;
    let made: ImageBitmap | undefined;
    createImageBitmap(asset.blob, { imageOrientation: 'from-image' })
      .then((b) => {
        if (!alive) return b.close();
        made = b;
        setState({ img: { bitmap: b, width: b.width, height: b.height }, for: asset.blob });
      })
      .catch(() => {
        if (alive) setState({ error: 'This file could not be opened as an image. It may be damaged.', for: asset.blob });
      });
    return () => {
      alive = false;
      made?.close();
    };
  }, [asset?.blob]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!asset || state.for !== asset.blob) return {};
  return { img: state.img, error: state.error };
}

/** Number field that keeps typing fluid: commits integers as they are typed, resets to the real value on blur. */
function NumField({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Field label={label}>
      {(p) => (
        <input
          {...p}
          className="pk-input"
          type="number"
          inputMode="numeric"
          step={1}
          min={label === 'Width' || label === 'Height' ? 1 : 0}
          max={max}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isInteger(n)) onCommit(n);
          }}
          onBlur={() => setDraft(String(value))}
        />
      )}
    </Field>
  );
}

export default function Tool() {
  const inputs = useToolInputs('redact');
  const [st, set] = useToolState<Stored>('redact', INITIAL);
  const jobs = useJobs('redact');
  const asset = inputs[0];
  const id = asset?.id ?? '';
  const { img, error } = useImage(asset);
  const hist = st.docs[id] ?? EMPTY;
  const present = hist.present;
  const selId = st.selected[id] ?? null;
  const sel = present.find((r) => r.id === selId);
  const job = asset ? jobs.find((j) => j.id === st.jobByInput[asset.id]) : undefined;
  const bounds = img ? { width: img.width, height: img.height } : { width: 1, height: 1 };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [live, setLive] = useState<Region[] | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const shown = live ?? present;

  useEffect(() => {
    const el = wrap.current;
    if (!el || !img) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  useEffect(() => {
    const c = canvasRef.current;
    if (c && img) c.getContext('2d')?.drawImage(img.bitmap, 0, 0);
  }, [img]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, unless focus is in a form field.
  useEffect(() => {
    if (!id) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input,textarea,select,[contenteditable]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const step = (fn: (h: History) => History) => {
        e.preventDefault();
        set((s) => (s.docs[id] ? { ...s, docs: { ...s.docs, [id]: fn(s.docs[id]!) } } : s));
      };
      if (k === 'z' && !e.shiftKey) step(undo);
      else if ((k === 'z' && e.shiftKey) || k === 'y') step(redo);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [id, set]);

  const apply = (regions: Region[]) => set((s) => ({ ...s, docs: { ...s.docs, [id]: commit(s.docs[id] ?? EMPTY, regions) } }));
  const select = (rid: string | null) => set((s) => ({ ...s, selected: { ...s.selected, [id]: rid } }));
  const layout = img && box.w > 0 && box.h > 0 ? fitLayout(img.width, img.height, box.w, box.h) : null;

  const pointIn = (e: RPointerEvent | globalThis.PointerEvent) => {
    if (!layout || !wrap.current) return null;
    const r = wrap.current.getBoundingClientRect();
    const p = toImage(layout, e.clientX - r.left, e.clientY - r.top);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  const onDownStage = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !layout) return;
    const p = pointIn(e);
    if (!p) return;
    wrap.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'create', anchor: p };
    select(null);
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const startRegion = (e: RPointerEvent<HTMLDivElement>, r: Region, corner?: Corner) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = pointIn(e);
    if (!p) return;
    wrap.current?.setPointerCapture(e.pointerId);
    select(r.id);
    gesture.current = corner ? { kind: 'resize', id: r.id, corner, start: r } : { kind: 'move', id: r.id, start: r, from: p };
  };
  const onMoveStage = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = pointIn(e);
    if (!p) return;
    if (g.kind === 'create') setDraft(clampRect(rectFromPoints(g.anchor.x, g.anchor.y, p.x, p.y), bounds));
    else if (g.kind === 'move') {
      const next = { x: g.start.x + p.x - g.from.x, y: g.start.y + p.y - g.from.y };
      setLive(updateRegion(present, g.id, next, bounds));
    } else setLive(updateRegion(present, g.id, resizeFromCorner(g.start, g.corner, p.x, p.y), bounds));
  };
  const onUpStage = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === 'create' && draft && draft.w >= 2 && draft.h >= 2) {
      const r = makeRegion(uid(), draft, st.style, st.style === 'solid' ? st.color : undefined);
      apply(addRegion(present, r, bounds));
      select(r.id);
    } else if (g && live) apply(live);
    setLive(null);
    setDraft(null);
  };

  const onKeyStage = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      apply(removeRegion(present, sel.id));
      select(null);
      return;
    }
    const patch = keyEdit(sel, e.key, { shift: e.shiftKey, alt: e.altKey });
    if (!patch) return;
    e.preventDefault();
    apply(updateRegion(present, sel.id, patch, bounds));
  };

  const addCentered = () => {
    if (!img) return;
    const r = makeRegion(uid(), centeredRect(bounds), st.style, st.style === 'solid' ? st.color : undefined);
    apply(addRegion(present, r, bounds));
    select(r.id);
  };

  const exportNow = () => {
    if (!asset || present.length === 0) return;
    const regions = present;
    const prev = jobs.find((j) => j.id === st.jobByInput[asset.id]);
    if (prev && isActive(prev)) cancelJob(prev.id);
    prev?.result?.assets.forEach((x) => removeAsset(x.id));
    const jobId = enqueue({
      toolId: 'redact',
      label: `Redact ${asset.name}`,
      inputIds: [asset.id],
      heavy: true,
      run: async (ctx) => {
        const out = await renderRedactedInWorker(asset.blob, regions, st.format, ctx);
        const ext = out.mime === 'image/png' ? 'png' : 'jpg';
        return { outputs: [{ name: outputName(asset.name, 'redacted', ext), mime: out.mime, blob: out.blob }], warnings: [] };
      },
    });
    set((s) => ({ ...s, jobByInput: { ...s.jobByInput, [asset.id]: jobId } }));
  };

  const out = job?.state === 'complete' ? job.result?.assets[0] : undefined;
  const exportHint = present.length === 0 ? 'Add a region to enable export.' : undefined;
  const styleOf = sel?.style ?? st.style;
  const colorOf = sel?.color ?? st.color;
  const setStyle = (style: RedactStyle) => {
    if (sel) apply(updateRegion(present, sel.id, { style }, bounds));
    set({ style });
  };
  const setColor = (color: string) => {
    if (sel) apply(updateRegion(present, sel.id, { color }, bounds));
    set({ color });
  };
  const patchSel = (p: Partial<Rect>) => {
    if (sel) apply(updateRegion(present, sel.id, p, bounds));
  };

  return (
    <ToolPage
      toolId="redact"
      settings={
        <div className="pk-stack">
          <h2>Redaction</h2>
          <Segmented<RedactStyle>
            label="Redaction style"
            value={styleOf}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'pixelate', label: 'Pixelate' },
              { value: 'blur', label: 'Blur' },
            ]}
            onChange={setStyle}
          />
          <p className="rd-note">Solid: cannot be reversed. Best for text.</p>
          <p className="rd-note">Pixelate and Blur: hide detail at a glance but can sometimes be reversed. Do not rely on them for sensitive text.</p>
          <Field label="Solid fill color" hint={styleOf === 'solid' ? undefined : 'Used by Solid regions only.'}>
            {(p) => <input {...p} type="color" className="rd-color" value={colorOf} disabled={styleOf !== 'solid'} onChange={(e) => setColor(e.target.value)} />}
          </Field>
          <div className="rd-row">
            <Button size="sm" disabled={!hist.past.length} onClick={() => set((s) => ({ ...s, docs: { ...s.docs, [id]: undo(s.docs[id] ?? EMPTY) } }))}>
              Undo
            </Button>
            <Button size="sm" disabled={!hist.future.length} onClick={() => set((s) => ({ ...s, docs: { ...s.docs, [id]: redo(s.docs[id] ?? EMPTY) } }))}>
              Redo
            </Button>
          </div>
          <p className="rd-note">Ctrl+Z undoes and Ctrl+Shift+Z redoes, when focus is not in a field.</p>
          <Segmented<RenderFormat>
            label="Output format"
            value={st.format}
            options={[
              { value: 'image/png', label: 'PNG' },
              { value: 'image/jpeg', label: 'JPEG' },
            ]}
            onChange={(format) => set({ format })}
          />
          <p className="rd-note">Automatic face detection is not available yet.</p>
          <p className="rd-note">Export flattens the image. The original pixels under a solid box are gone from the exported file, and its metadata is removed. Pixelated or blurred areas can sometimes be guessed.</p>
          <Button variant="primary" block disabled={!!exportHint || !asset || !img} onClick={exportNow} aria-describedby={exportHint ? 'rd-export-hint' : undefined}>
            Export redacted image
          </Button>
          {exportHint && (
            <p id="rd-export-hint" className="rd-note">
              {exportHint}
            </p>
          )}
        </div>
      }
    >
      {!asset ? (
        <DropZone toolId="redact" multiple={false} />
      ) : (
        <>
          {error && <Notice kind="error">{error}</Notice>}
          {!img && !error && <p className="muted">Opening image…</p>}
          {img && (
            <>
              <p id="rd-help" className="rd-note">
                Drag on the image to draw a box, or press Add region. Click a region to select it. With a region selected, arrow keys move it (Shift for 10 px), Alt with arrow keys resizes it, and Delete removes it.
              </p>
              <div className="rd-row">
                <Button size="sm" onClick={addCentered}>
                  Add region
                </Button>
              </div>
              <div
                ref={wrap}
                className="rd-stage"
                role="application"
                tabIndex={0}
                aria-label={`Redaction canvas for ${asset.name}. ${present.length} regions.`}
                aria-describedby="rd-help"
                onPointerDown={onDownStage}
                onPointerMove={onMoveStage}
                onPointerUp={onUpStage}
                onPointerCancel={onUpStage}
                onKeyDown={onKeyStage}
              >
                {layout && (
                  <>
                    <canvas
                      ref={canvasRef}
                      width={img.width}
                      height={img.height}
                      aria-hidden
                      style={{ left: layout.offsetX, top: layout.offsetY, width: img.width * layout.scale, height: img.height * layout.scale }}
                    />
                    {shown.map((r) => {
                      const tl = toPreview(layout, r.x, r.y);
                      const isSel = r.id === selId;
                      return (
                        <div
                          key={r.id}
                          className={`rd-region rd-region--${r.style}${isSel ? ' rd-region--sel' : ''}`}
                          style={{ left: tl.x, top: tl.y, width: r.w * layout.scale, height: r.h * layout.scale, ...(r.style === 'solid' && r.color ? { background: r.color } : {}) }}
                          onPointerDown={(e) => startRegion(e, r)}
                          aria-hidden
                        >
                          {isSel &&
                            CORNERS.map((c) => (
                              <div key={c} className={`rd-handle rd-handle--${c}`} onPointerDown={(e) => startRegion(e, r, c)} />
                            ))}
                        </div>
                      );
                    })}
                    {draft && draft.w > 0 && (
                      <div className="rd-draft" style={{ left: toPreview(layout, draft.x, draft.y).x, top: toPreview(layout, draft.x, draft.y).y, width: draft.w * layout.scale, height: draft.h * layout.scale }} />
                    )}
                  </>
                )}
              </div>

              <fieldset className="rd-fields" aria-describedby={sel ? undefined : 'rd-sel-hint'}>
                <legend>Selected region</legend>
                {sel ? (
                  <>
                    <NumField label="X" value={sel.x} max={img.width - sel.w} onCommit={(n) => patchSel({ x: n })} />
                    <NumField label="Y" value={sel.y} max={img.height - sel.h} onCommit={(n) => patchSel({ y: n })} />
                    <NumField label="Width" value={sel.w} max={img.width - sel.x} onCommit={(n) => patchSel({ w: n })} />
                    <NumField label="Height" value={sel.h} max={img.height - sel.y} onCommit={(n) => patchSel({ h: n })} />
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Button size="sm" variant="danger" onClick={() => { apply(removeRegion(present, sel.id)); select(null); }}>
                        Remove region
                      </Button>
                    </div>
                  </>
                ) : (
                  <p id="rd-sel-hint" className="rd-note" style={{ gridColumn: '1 / -1' }}>
                    Select a region to edit its position and size.
                  </p>
                )}
              </fieldset>

              {present.length > 0 && (
                <section aria-labelledby="rd-regions">
                  <h2 id="rd-regions" style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
                    Regions · {present.length}
                  </h2>
                  <ul className="rd-list">
                    {present.map((r, i) => (
                      <li key={r.id}>
                        <button type="button" aria-pressed={r.id === selId} onClick={() => select(r.id)}>
                          {describeRegion(r, i)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {job && (isActive(job) || job.state === 'failed' || job.state === 'canceled') && <JobStatus job={job} />}
          {out && (
            <>
              <Button variant="primary" onClick={() => downloadAsset(out)}>
                Download result
              </Button>
              <ul className="pk-assets">
                <AssetRow asset={out} exclude="redact" />
              </ul>
            </>
          )}
        </>
      )}
    </ToolPage>
  );
}
