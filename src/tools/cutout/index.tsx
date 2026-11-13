import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow, downloadAsset } from '@/components/AssetList';
import { JobBadge, JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Progress, Segmented } from '@/components/ui';
import { assetUrl, removeAsset, setInputs, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import type { Job } from '@/jobs/types';
import { formatBytes, outputName } from '@/lib/format';
import { ToolError } from '@/lib/errors';
import { compose, disposeEngine, ensureModel, hasWasmSimd, headSize, isModelLoaded, segment } from '@/engines/cutout/client';
import { deleteModelCaches, listModelCaches } from '@/engines/cutout/cache';
import { ENGINE, MODEL } from '@/engines/cutout/model';
import { fillRect, matteToRgba, paintLine, refine, union, type Rect } from '@/engines/cutout/matte';
import { edits, keepOnly, patchEdit, storeSegment, touch, type MatteEdit } from './state';
import './cutout.css';

type Stored = {
  keep: boolean;
  threshold: number;
  feather: number;
  brush: 'erase' | 'restore';
  brushSize: number;
  rect: { x: string; y: string; w: string; h: string };
  jobByInput: Record<string, string>;
  /** Signature (matte rev + refinement) of the matte that the current PNG was made from. */
  exportedSig: Record<string, string>;
};
const INITIAL: Stored = {
  keep: false,
  threshold: 0,
  feather: 0,
  brush: 'erase',
  brushSize: 24,
  rect: { x: '0', y: '0', w: '', h: '' },
  jobByInput: {},
  exportedSig: {},
};

const sigOf = (e: MatteEdit, st: Stored) => `${e.rev}:${st.threshold}:${st.feather}`;

export default function Tool() {
  const inputs = useToolInputs('cutout');
  const input = inputs[inputs.length - 1];
  const [st, set] = useToolState<Stored>('cutout', INITIAL);
  const jobs = useJobs('cutout');
  const edit = edits.use((s) => (input ? s[input.id] : undefined));
  const [simd] = useState(hasWasmSimd);
  const [sizes, setSizes] = useState<{ model: number; engine: number }>({ model: MODEL.bytes, engine: ENGINE.bytes });
  const [cached, setCached] = useState<number | null>(null);
  const [cacheMsg, setCacheMsg] = useState('');

  useEffect(() => {
    void Promise.all([headSize(MODEL.url, MODEL.bytes), headSize(ENGINE.wasmUrl, ENGINE.bytes)]).then(([model, engine]) => setSizes({ model, engine }));
    return () => disposeEngine(); // one heavy model in memory: release the worker when leaving the tool
  }, []);
  const refreshCache = () =>
    void listModelCaches()
      .then((l) => setCached(l.reduce((n, c) => n + c.bytes, 0)))
      .catch(() => setCached(null));
  useEffect(refreshCache, []);
  useEffect(() => keepOnly(input?.id), [input?.id]);

  const job = input ? jobs.find((j) => j.id === st.jobByInput[input.id]) : undefined;
  const busy = job ? isActive(job) : false;
  const out = job?.state === 'complete' ? job.result?.assets[0] : undefined;
  const stale = !!out && !!edit && st.exportedSig[input!.id] !== sigOf(edit, st);

  const run = (mode: 'full' | 'export') => {
    if (!input) return;
    const a = input;
    const prev = job;
    if (prev && isActive(prev)) cancelJob(prev.id);
    const prevOut = prev?.result?.assets.map((x) => x.id) ?? [];
    const keep = st.keep;
    const { threshold, feather } = st;
    const id = enqueue({
      toolId: 'cutout',
      label: `Cut out ${a.name}`,
      inputIds: [a.id],
      heavy: true,
      run: async (ctx) => {
        const warnings = mode === 'full' ? await ensureModel(keep, ctx) : [];
        const t0 = performance.now();
        let e = edits.get()[a.id];
        if (mode === 'full' || !e) e = storeSegment(a.id, await segment(a.blob, ctx), 0);
        const sig = `${e.rev}:${threshold}:${feather}`;
        const res = await compose(a.blob, refine(e.matte, e.ew, e.eh, threshold, feather), e.ew, e.eh, ctx);
        if (mode === 'full') patchEdit(a.id, { processMs: performance.now() - t0 });
        if (res.width !== e.width || res.height !== e.height) throw new ToolError('size', 'The result size does not match the original.', 'Try again.');
        prevOut.forEach(removeAsset); // replace the previous result only once the new one exists
        set((s) => ({ ...s, exportedSig: { ...s.exportedSig, [a.id]: sig } }));
        if (keep) refreshCache();
        return { outputs: [{ name: outputName(a.name, 'cutout', 'png'), mime: 'image/png', blob: res.blob }], warnings };
      },
    });
    set((s) => ({ ...s, jobByInput: { ...s.jobByInput, [a.id]: id } }));
  };

  const loaded = isModelLoaded();
  const total = sizes.model + sizes.engine;

  return (
    <ToolPage
      toolId="cutout"
      settings={
        <div className="pk-stack">
          <h2>Model</h2>
          <dl className="cut-facts">
            <dt>Model</dt>
            <dd>
              {MODEL.name} · <span className="mono">{formatBytes(sizes.model)}</span> ·{' '}
              <a href={MODEL.licenceUrl} target="_blank" rel="noreferrer">
                {MODEL.licence}
              </a>
            </dd>
            <dt>Engine</dt>
            <dd>
              ONNX Runtime Web · <span className="mono">{formatBytes(sizes.engine)}</span> · {ENGINE.licence}
            </dd>
          </dl>
          <p className="cut-hint">
            {loaded
              ? 'Model loaded for this session.'
              : `First use downloads ${formatBytes(total)} (${total.toLocaleString('en-US')} bytes) from this site.`}
          </p>
          <label className="pk-check">
            <input type="checkbox" checked={st.keep} onChange={(e) => set({ keep: e.target.checked })} />
            Keep the model on this device for next time
          </label>
          <p className="cut-hint">
            {cached ? `Kept on this device: ${formatBytes(cached)}.` : 'Nothing kept on this device.'} Your image is never stored.
          </p>
          <Button
            size="sm"
            disabled={!cached}
            onClick={async () => {
              await deleteModelCaches();
              setCacheMsg('Downloaded model deleted from this device.');
              refreshCache();
            }}
          >
            Delete downloaded model
          </Button>
          <p className="cut-hint" aria-live="polite">
            {cacheMsg}
          </p>

          <h2>Refine</h2>
          <Field label="Edge threshold" hint="Removes faint haze around the subject. 0 keeps the model's edges.">
            {(p) => (
              <div className="cut-range">
                <input {...p} type="range" className="pk-range" min={0} max={200} value={st.threshold} disabled={!edit} onChange={(e) => set({ threshold: Number(e.target.value) })} />
                <output className="mono" htmlFor={p.id}>
                  {st.threshold}
                </output>
              </div>
            )}
          </Field>
          <Field label="Feather" hint="Softens the edge, in preview pixels.">
            {(p) => (
              <div className="cut-range">
                <input {...p} type="range" className="pk-range" min={0} max={10} value={st.feather} disabled={!edit} onChange={(e) => set({ feather: Number(e.target.value) })} />
                <output className="mono" htmlFor={p.id}>
                  {st.feather}
                </output>
              </div>
            )}
          </Field>

          <p className="cut-hint">
            WebAssembly SIMD: {simd ? 'available' : 'not available'}.
            {edit?.processMs ? ` Last run: ${(edit.processMs / 1000).toFixed(1)} s on this device.` : ''}
          </p>
          <p className="cut-hint">Your image stays on this device. The model file is downloaded from this site.</p>
        </div>
      }
    >
      {!simd ? (
        <Notice kind="error">
          <strong>Cutout is unsupported in this browser.</strong>
          <div>The engine needs WebAssembly SIMD. Use a current Chrome, Edge, Firefox or Safari.</div>
        </Notice>
      ) : !input ? (
        <DropZone toolId="cutout" multiple={false} hint="Your image stays on this device." />
      ) : (
        <>
          {edit ? <Editor key={input.id} input={input} edit={edit} st={st} set={set} /> : <img className="cut-plain" src={assetUrl(input)} alt={`Original: ${input.name}`} />}

          <div className="pk-row cut-actions">
            <Button variant="primary" disabled={busy} onClick={() => run('full')}>
              {loaded ? 'Remove background' : 'Download model and remove background'}
            </Button>
            {stale && (
              <Button disabled={busy} onClick={() => run('export')}>
                Update PNG with edits
              </Button>
            )}
            {out && (
              <Button onClick={() => downloadAsset(out)} disabled={stale}>
                Download PNG
              </Button>
            )}
          </div>
          <Notice kind="info">Hair, glass and fine edges are often imperfect.</Notice>
          {stale && <Notice kind="warn">The PNG does not include your latest edits yet.</Notice>}

          {job && (
            <section aria-labelledby="cut-result" className="cut-result">
              <div className="pk-row" style={{ justifyContent: 'space-between' }}>
                <h2 id="cut-result">Result</h2>
                <JobBadge job={job} />
              </div>
              {isActive(job) ? <CutoutProgress job={job} /> : job.state !== 'complete' && <JobStatus job={job} />}
              {job.result?.warnings.map((w) => (
                <Notice key={w} kind="warn">
                  {w}
                </Notice>
              ))}
              {out && edit && (
                <ul className="pk-assets">
                  <AssetRow asset={out} exclude="cutout" detail={`${edit.width} × ${edit.height} px`} />
                </ul>
              )}
            </section>
          )}

          <DropZone
            toolId="cutout"
            compact
            multiple={false}
            hint="Choose another image to replace this one."
            onAdded={(added) => added[0] && setInputs('cutout', [added[0].id])}
          />
        </>
      )}
    </ToolPage>
  );
}

/** Distinguishes downloading the model (known fraction) from removing the background (indeterminate). */
function CutoutProgress({ job }: { job: Job }) {
  const p = job.progress;
  const label =
    job.state === 'queued'
      ? 'Waiting for another job to finish'
      : p?.stage === 'loading-engine'
        ? p.message === 'Loading model from this device'
          ? 'Loading model from this device'
          : 'Downloading model'
        : p?.stage === 'exporting'
          ? 'Writing PNG'
          : p?.stage === 'processing'
            ? 'Removing background'
            : 'Starting';
  const stage = job.state === 'queued' ? 'queued' : (p?.stage ?? 'starting');
  return (
    <div className="pk-stack" style={{ gap: 8 }} data-cutout-stage={stage}>
      <div className="pk-row" style={{ justifyContent: 'space-between' }}>
        <span aria-live="polite">
          {label}
          {typeof p?.fraction === 'number' ? ` · ${Math.round(p.fraction * 100)}%` : ''}
        </span>
        <Button size="sm" onClick={() => cancelJob(job.id)}>
          Cancel
        </Button>
      </div>
      <Progress fraction={job.state === 'running' ? p?.fraction : undefined} label={label} />
    </div>
  );
}

type EditorProps = { input: SessionAsset; edit: MatteEdit; st: Stored; set: (p: Partial<Stored>) => void };

/** Preview over a checkerboard, before/after slider, brush and rectangle edits with undo. */
function Editor({ input, edit, st, set }: EditorProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [pos, setPos] = useState(0);
  const stroke = useRef<{ before: Uint8Array; last: [number, number]; rect: Rect | null } | null>(null);
  const [rectErr, setRectErr] = useState('');

  useEffect(() => {
    let alive = true;
    let b: ImageBitmap | undefined;
    void createImageBitmap(input.blob, { imageOrientation: 'from-image', resizeWidth: edit.ew, resizeHeight: edit.eh, resizeQuality: 'high' }).then((x) => {
      if (alive) setBmp((b = x));
      else x.close();
    });
    return () => {
      alive = false;
      b?.close();
    };
  }, [input.blob, edit.ew, edit.eh]);

  // Redraw the preview whenever the matte or refinement changes.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !bmp) return;
    const m = refine(edit.matte, edit.ew, edit.eh, st.threshold, st.feather);
    const alpha = new ImageData(matteToRgba(m), edit.ew, edit.eh);
    const tmp = new OffscreenCanvas(edit.ew, edit.eh);
    tmp.getContext('2d')!.putImageData(alpha, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(bmp, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(tmp, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }, [bmp, edit, edit.rev, st.threshold, st.feather]);

  // Map a pointer to matte pixels, accounting for object-fit: contain letterboxing.
  const toMatte = (e: RPointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = Math.min(r.width / edit.ew, r.height / edit.eh);
    const ox = (r.width - edit.ew * s) / 2;
    const oy = (r.height - edit.eh * s) / 2;
    return [(e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s];
  };
  const value = st.brush === 'erase' ? 0 : 255;
  const radius = st.brushSize / 2; // brush size is in preview (edit-matte) pixels
  const dab = (from: [number, number], to: [number, number]) => {
    const s = stroke.current!;
    s.rect = union(s.rect, paintLine(edit.matte, edit.ew, edit.eh, from[0], from[1], to[0], to[1], radius, value));
    s.last = to;
    touch(input.id);
  };

  const scale = edit.ew / edit.width;
  const applyRect = (v: number) => {
    const n = (k: keyof Stored['rect']) => Number(st.rect[k]);
    const r = { x: n('x'), y: n('y'), w: st.rect.w === '' ? edit.width : n('w'), h: st.rect.h === '' ? edit.height : n('h') };
    if (![r.x, r.y, r.w, r.h].every((x) => Number.isFinite(x) && x >= 0) || r.w === 0 || r.h === 0) {
      setRectErr('Enter whole pixels: x and y from 0, width and height above 0.');
      return;
    }
    setRectErr('');
    const before = edit.matte.slice();
    const changed = fillRect(edit.matte, edit.ew, edit.eh, { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }, v);
    if (!changed) return setRectErr('That rectangle is outside the image.');
    edit.history.record(edit.matte, edit.ew, before, changed);
    touch(input.id);
  };

  return (
    <div className="pk-stack">
      <figure className="cut">
        <div className="cut__stage pk-checker">
          {/* The original is only shown left of the divider, so removed areas reveal the checkerboard, not the old background. */}
          <img className="cut__img" src={assetUrl(input)} alt={`Original: ${input.name}`} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
          <canvas
            ref={canvas}
            width={edit.ew}
            height={edit.eh}
            className="cut__img cut__canvas"
            style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
            role="img"
            aria-label={`Cutout preview of ${input.name}. Drag on it to ${st.brush} the matte.`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = toMatte(e);
              stroke.current = { before: edit.matte.slice(), last: p, rect: null };
              dab(p, p);
            }}
            onPointerMove={(e) => stroke.current && dab(stroke.current.last, toMatte(e))}
            onPointerUp={() => {
              const s = stroke.current;
              stroke.current = null;
              if (s) {
                edit.history.record(edit.matte, edit.ew, s.before, s.rect);
                touch(input.id);
              }
            }}
            onPointerCancel={() => {
              const s = stroke.current;
              stroke.current = null;
              if (s) {
                edit.matte.set(s.before);
                touch(input.id);
              }
            }}
          />
          {pos > 0 && <div className="cut__line" style={{ left: `${pos}%` }} aria-hidden />}
          {pos > 0 && <span className="cut__tag cut__tag--l mono">Original</span>}
          <span className="cut__tag cut__tag--r mono">Cutout</span>
        </div>
        <input
          type="range"
          className="pk-range"
          min={0}
          max={100}
          value={pos}
          aria-label="Compare original and cutout"
          aria-valuetext={`Original ${pos}%, cutout ${100 - pos}%`}
          onChange={(e) => setPos(Number(e.target.value))}
        />
      </figure>

      <fieldset className="cut-edit">
        <legend>Edit the matte</legend>
        <div className="pk-row cut-wrap">
          <Segmented<Stored['brush']>
            label="Brush"
            value={st.brush}
            options={[
              { value: 'erase', label: 'Erase' },
              { value: 'restore', label: 'Restore' },
            ]}
            onChange={(brush) => set({ brush })}
          />
          <Field label="Brush size">
            {(p) => (
              <div className="cut-range">
                <input {...p} type="range" className="pk-range" min={2} max={120} value={st.brushSize} onChange={(e) => set({ brushSize: Number(e.target.value) })} />
                <output className="mono" htmlFor={p.id}>
                  {st.brushSize}
                </output>
              </div>
            )}
          </Field>
          <Button
            size="sm"
            disabled={!edit.history.canUndo}
            onClick={() => {
              edit.history.undo(edit.matte, edit.ew);
              touch(input.id);
            }}
          >
            Undo
          </Button>
          <Button
            size="sm"
            disabled={!edit.history.canRedo}
            onClick={() => {
              edit.history.redo(edit.matte, edit.ew);
              touch(input.id);
            }}
          >
            Redo
          </Button>
        </div>
        <p className="cut-hint">Drag on the preview to paint, or type a rectangle in original image pixels ({edit.width} × {edit.height}). Up to 20 steps can be undone.</p>
        <div className="cut-rect">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <Field key={k} label={{ x: 'X', y: 'Y', w: 'Width', h: 'Height' }[k]}>
              {(p) => (
                <input
                  {...p}
                  className="pk-input"
                  inputMode="numeric"
                  placeholder={k === 'w' ? String(edit.width) : k === 'h' ? String(edit.height) : '0'}
                  value={st.rect[k]}
                  onChange={(e) => set({ rect: { ...st.rect, [k]: e.target.value } })}
                />
              )}
            </Field>
          ))}
        </div>
        {rectErr && (
          <p role="alert" className="cut-err">
            {rectErr}
          </p>
        )}
        <div className="pk-row cut-wrap">
          <Button size="sm" onClick={() => applyRect(0)}>
            Erase all in rectangle
          </Button>
          <Button size="sm" onClick={() => applyRect(255)}>
            Restore all in rectangle
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
