import { useEffect, useMemo, useRef, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow, downloadAsset } from '@/components/AssetList';
import { JobBadge, JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { assetUrl, removeAsset, removeInput, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import type { Job } from '@/jobs/types';
import { formatBytes, outputName, percentChange } from '@/lib/format';
import { useEncoderSupport, useSniffed } from '@/engines/image/hooks';
import type { ImageMime } from '@/engines/image/sniff';
import { resizeImage } from '@/engines/resize/client';
import { ASPECTS, cropNorm, EXT, flipNorm, orientedSize, PRESETS, rotateNorm } from '@/engines/resize/geometry';
import type { OutputMime, RenderResult } from '@/engines/resize/types';
import { aspectIdOf, FORMAT_LABEL, FULL, INITIAL, isInputMime, ratioOf, renderSettings, targetFrom, type FormatChoice, type Mode, type ResizeForm } from './form';
import { CropStage } from './CropStage';
import './resize.css';

const MODES: { value: Mode; label: string }[] = [
  { value: 'exact', label: 'Exact size' },
  { value: 'percent', label: 'Percent' },
  { value: 'fit', label: 'Fit within' },
];

/** Engine details for each output, keyed by its blob (WeakMap: released with the asset). */
const details = new WeakMap<Blob, RenderResult>();

const LOSSY_IN = (m: ImageMime | null | undefined) => m === 'image/jpeg' || m === 'image/webp';

export default function ResizeTool() {
  const allInputs = useToolInputs('resize');
  const inputs = useMemo(() => allInputs.filter((a) => a.mime.startsWith('image/')), [allInputs]);
  const [st, set] = useToolState<ResizeForm>('resize', INITIAL);
  const sniffed = useSniffed(inputs);
  const support = useEncoderSupport();
  const jobs = useJobs('resize');
  const selected = inputs.find((a) => a.id === st.selectedId) ?? inputs[0];
  const img = usePreviewImage(selected);

  const jobFor = (a: SessionAsset): Job | undefined => {
    const id = st.jobByInput[a.id];
    return id ? jobs.find((j) => j.id === id) : undefined;
  };

  const issueOf = (a: SessionAsset): string | undefined => {
    if (!sniffed.has(a.id)) return 'Checking format';
    const m = sniffed.get(a.id);
    if (!m) return 'Not a recognized image';
    if (!isInputMime(m)) return `${m.replace('image/', '').toUpperCase()} is not supported by Resize. Convert it first.`;
    return undefined;
  };

  const runnable = inputs.filter((a) => issueOf(a) === undefined);
  const target = targetFrom(st);
  const count = runnable.length;
  const runnableMimes = runnable.map((a) => sniffed.get(a.id));
  const qualityApplies = st.format === 'keep' ? runnableMimes.some(LOSSY_IN) : st.format !== 'image/png';
  const selectedOut = selected ? outputOf(jobFor(selected)) : undefined;

  const formatOptions: { value: FormatChoice; label: string }[] = [
    { value: 'keep', label: 'Keep original' },
    ...(['image/jpeg', 'image/png', 'image/webp'] as OutputMime[])
      .filter((m) => support?.encodable[m])
      .map((m) => ({ value: m, label: FORMAT_LABEL[m] })),
  ];

  const removeFromTool = (a: SessionAsset) => {
    const j = jobFor(a);
    if (j && isActive(j)) cancelJob(j.id);
    removeInput('resize', a.id);
    set({
      jobByInput: Object.fromEntries(Object.entries(st.jobByInput).filter(([k]) => k !== a.id)),
      selectedId: st.selectedId === a.id ? null : st.selectedId,
    });
  };

  const run = () => {
    if (!target.ok) return;
    const settings = renderSettings(st, target.target);
    const next = { ...st.jobByInput };
    for (const a of runnable) {
      // Re-running replaces this input's previous result. The original is never touched.
      const prev = jobFor(a);
      if (prev && isActive(prev)) cancelJob(prev.id);
      prev?.result?.assets.forEach((x) => removeAsset(x.id));
      next[a.id] = enqueue({
        toolId: 'resize',
        label: `Resize ${a.name}`,
        inputIds: [a.id],
        heavy: true,
        run: async (ctx) => {
          const res = await resizeImage(a.blob, settings, ctx);
          details.set(res.blob, res);
          return { outputs: [{ name: outputName(a.name, 'resized', EXT[res.mime]), mime: res.mime, blob: res.blob }], warnings: res.warnings };
        },
      });
    }
    set({ jobByInput: next, selectedId: selected?.id ?? null });
  };

  // Rotation and flips move the crop with the image, so the box keeps covering the same pixels.
  const rotate = (dir: 1 | 3) => set({ turns: ((st.turns + dir) % 4) as ResizeForm['turns'], crop: rotateNorm(st.crop, dir) });
  const flip = (axis: 'h' | 'v') =>
    set(axis === 'h' ? { flipH: !st.flipH, crop: flipNorm(st.crop, 'h') } : { flipV: !st.flipV, crop: flipNorm(st.crop, 'v') });

  const applyPreset = (p: (typeof PRESETS)[number]) =>
    set({ mode: 'exact', lock: false, width: String(p.width), height: String(p.height), aspect: p.width / p.height, crop: FULL });

  const oriented = img ? orientedSize(img.naturalWidth, img.naturalHeight, st.turns) : null;
  const displayCrop = oriented ? cropNorm(oriented.width, oriented.height, st.crop, st.aspect) : st.crop;
  const aspectId = aspectIdOf(st.aspect);

  return (
    <ToolPage
      toolId="resize"
      settings={
        <div className="pk-stack rz-settings">
          <h2>Resize</h2>
          <Segmented<Mode> label="Resize by" value={st.mode} options={MODES} onChange={(mode) => set({ mode })} />

          {st.mode === 'exact' && (
            <>
              <div className="rz-row">
                <Field label="Width (px)">{(p) => <input {...p} className="pk-input" inputMode="numeric" value={st.width} onChange={(e) => set({ width: e.target.value })} />}</Field>
                <Field label="Height (px)" hint={st.lock ? 'Follows each image’s proportions.' : undefined}>
                  {(p) => <input {...p} className="pk-input" inputMode="numeric" disabled={st.lock} value={st.height} onChange={(e) => set({ height: e.target.value })} />}
                </Field>
              </div>
              <label className="rz-check">
                <input type="checkbox" checked={st.lock} onChange={(e) => set({ lock: e.target.checked })} /> Lock aspect ratio
              </label>
            </>
          )}
          {st.mode === 'percent' && (
            <Field label="Percent of original size" hint="From 1 to 800.">
              {(p) => <input {...p} className="pk-input" inputMode="decimal" value={st.percent} onChange={(e) => set({ percent: e.target.value })} />}
            </Field>
          )}
          {st.mode === 'fit' && (
            <Field label="Longest side (px)" hint="Scales down to fit. Never enlarges unless you ask for a size above the original.">
              {(p) => <input {...p} className="pk-input" inputMode="numeric" value={st.maxEdge} onChange={(e) => set({ maxEdge: e.target.value })} />}
            </Field>
          )}
          {!target.ok && <Notice kind="error">{target.error}</Notice>}

          <div className="rz-presets" role="group" aria-label="Size presets">
            {PRESETS.map((p) => (
              <Button key={p.id} size="sm" onClick={() => applyPreset(p)}>
                {p.label}
              </Button>
            ))}
          </div>

          <h2>Crop and rotate</h2>
          <Field label="Crop shape">
            {(p) => (
              <select
                {...p}
                className="pk-select"
                value={aspectId}
                onChange={(e) => set({ aspect: ratioOf(e.target.value), crop: FULL })}
              >
                {ASPECTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
                {aspectId === 'custom' && <option value="custom">Preset shape</option>}
              </select>
            )}
          </Field>
          <div className="rz-presets" role="group" aria-label="Rotate and flip">
            <Button size="sm" onClick={() => rotate(3)}>Rotate left</Button>
            <Button size="sm" onClick={() => rotate(1)}>Rotate right</Button>
            <Button size="sm" aria-pressed={st.flipH} onClick={() => flip('h')}>Flip horizontal</Button>
            <Button size="sm" aria-pressed={st.flipV} onClick={() => flip('v')}>Flip vertical</Button>
            <Button size="sm" variant="ghost" onClick={() => set({ crop: FULL })}>Reset crop</Button>
          </div>

          <h2>Output</h2>
          <Field label="Output format" hint={support ? 'Only formats this browser can write are listed.' : 'Checking which formats this browser can write.'}>
            {(p) => (
              <select {...p} className="pk-select" value={st.format} onChange={(e) => set({ format: e.target.value as FormatChoice })}>
                {formatOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {qualityApplies ? (
            <Field label="Quality">
              {(p) => (
                <div className="rz-range">
                  <input {...p} type="range" className="pk-range" min={1} max={100} value={st.quality} onChange={(e) => set({ quality: Number(e.target.value) })} />
                  <output className="mono" htmlFor={p.id}>{st.quality}</output>
                </div>
              )}
            </Field>
          ) : (
            <p className="rz-hint">PNG is lossless: quality does not apply.</p>
          )}

          <Button variant="primary" block disabled={count === 0 || !target.ok} onClick={run}>
            {count > 1 ? `Resize ${count} files` : 'Resize'}
          </Button>
        </div>
      }
    >
      {inputs.length === 0 ? (
        <DropZone toolId="resize" />
      ) : (
        <>
          {selected && (
            <section className="rz-preview" aria-label="Crop preview">
              {img === undefined ? (
                <p className="rz-hint">Loading preview</p>
              ) : img === null ? (
                <Notice kind="warn">This browser cannot preview {selected.name}. It can still be resized if the browser can decode it.</Notice>
              ) : (
                <CropStage
                  key={selected.id}
                  img={img}
                  name={selected.name}
                  turns={st.turns}
                  flipH={st.flipH}
                  flipV={st.flipV}
                  crop={displayCrop}
                  aspect={st.aspect}
                  onChange={(crop) => set({ crop })}
                />
              )}
              {selectedOut && (
                <Button variant="primary" onClick={() => downloadAsset(selectedOut)} className="rz-download">
                  Download result
                </Button>
              )}
            </section>
          )}

          <section aria-labelledby="rz-files">
            <h2 id="rz-files">Files · {inputs.length}</h2>
            <ul className="pk-assets">
              {inputs.map((a) => {
                const issue = issueOf(a);
                return (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    exclude="resize"
                    detail={issue ?? `Detected ${FORMAT_LABEL_OF(sniffed.get(a.id))}`}
                    onRemove={removeFromTool}
                    extra={
                      <Button size="sm" variant="ghost" aria-pressed={selected?.id === a.id} onClick={() => set({ selectedId: a.id })}>
                        Preview <span className="sr-only">{a.name}</span>
                      </Button>
                    }
                  />
                );
              })}
            </ul>
            <DropZone toolId="resize" compact multiple />
          </section>

          <section aria-labelledby="rz-results" className="rz-results">
            <h2 id="rz-results">Results</h2>
            {inputs.map((a) => (
              <ResultBlock key={a.id} input={a} job={jobFor(a)} />
            ))}
          </section>
        </>
      )}
    </ToolPage>
  );
}

const FORMAT_LABEL_OF = (m: ImageMime | null | undefined): string => (m ? m.replace('image/', '').toUpperCase() : 'unknown');

function outputOf(job: Job | undefined): SessionAsset | undefined {
  return job?.state === 'complete' ? job.result?.assets[0] : undefined;
}

/** Decoded preview image: undefined while loading, null when this browser cannot show it. */
function usePreviewImage(asset: SessionAsset | undefined): HTMLImageElement | null | undefined {
  const [loaded, setLoaded] = useState<{ id: string; img: HTMLImageElement | null } | null>(null);
  const id = asset?.id;
  const url = asset ? assetUrl(asset) : null;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    if (id === undefined || url === null) return;
    const el = new Image();
    el.onload = () => live.current && setLoaded({ id, img: el });
    el.onerror = () => live.current && setLoaded({ id, img: null });
    el.src = url;
    return () => {
      live.current = false;
    };
  }, [id, url]);
  if (id === undefined) return undefined;
  return loaded?.id === id ? loaded.img : undefined;
}

function ResultBlock({ input, job }: { input: SessionAsset; job: Job | undefined }) {
  if (!job) return null;
  const out = outputOf(job);
  const d = out ? details.get(out.blob) : undefined;
  const pct = out ? percentChange(input.size, out.size) : 0;
  return (
    <article className="rz-result" aria-label={input.name}>
      <div className="pk-row" style={{ justifyContent: 'space-between' }}>
        <h3 className="rz-name">{input.name}</h3>
        <JobBadge job={job} />
      </div>
      {job.state !== 'complete' && <JobStatus job={job} />}
      {out && d && (
        <>
          <p className="mono">
            Before {d.sourceWidth} × {d.sourceHeight} px, {formatBytes(input.size)} → after {d.width} × {d.height} px, {formatBytes(out.size)} ({pct > 0 ? '+' : ''}
            {pct}%)
          </p>
          {d.upscaled && <Notice kind="warn">The target is larger than the original, so this image was enlarged to {d.width} × {d.height} px. Enlarged images look softer.</Notice>}
          {job.result?.warnings.length ? (
            <ul className="rz-warnings">
              {job.result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <ul className="pk-assets">
            <AssetRow asset={out} exclude="resize" detail={d.quality !== null ? `quality ${Math.round(d.quality * 100)}` : undefined} />
          </ul>
        </>
      )}
    </article>
  );
}
