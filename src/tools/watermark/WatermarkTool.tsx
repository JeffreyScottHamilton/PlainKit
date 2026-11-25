import { useEffect, useMemo, useRef, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobBadge, JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { assetUrl, removeInput, removeAsset, useAssets, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import type { Job } from '@/jobs/types';
import { formatBytes, outputName } from '@/lib/format';
import { useEncoderSupport, useSniffed } from '@/engines/image/hooks';
import type { ImageMime } from '@/engines/image/sniff';
import { watermarkImage } from '@/engines/watermark/client';
import { drawWatermark, prepareLogo } from '@/engines/watermark/draw';
import { FONT_OPTIONS, fontCss, loadInter } from '@/engines/watermark/fonts';
import { EXT, WM_INPUT_MIMES } from '@/engines/watermark/layout';
import type { OutputMime, Position, RenderResult, WatermarkSettings } from '@/engines/watermark/types';
import { INITIAL, toSettings, type FormatChoice, type Kind, type PlaceKind, type WatermarkForm } from './form';
import './watermark.css';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'logo', label: 'Logo' },
];
const PLACEMENTS: { value: PlaceKind; label: string }[] = [
  { value: 'grid', label: 'Single position' },
  { value: 'tile', label: 'Tiled pattern' },
];
const POSITIONS: { id: Position; label: string }[] = [
  { id: 'tl', label: 'Top left' },
  { id: 'tc', label: 'Top center' },
  { id: 'tr', label: 'Top right' },
  { id: 'ml', label: 'Middle left' },
  { id: 'mc', label: 'Middle center' },
  { id: 'mr', label: 'Middle right' },
  { id: 'bl', label: 'Bottom left' },
  { id: 'bc', label: 'Bottom center' },
  { id: 'br', label: 'Bottom right' },
];
const FORMAT_LABEL: Record<OutputMime, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const PREVIEW_MAX = 720;

/** Engine details for each output, keyed by its blob (WeakMap: released with the asset). */
const details = new WeakMap<Blob, RenderResult>();

const isInputMime = (m: ImageMime | null | undefined): boolean => WM_INPUT_MIMES.some((x) => x === m);
const LOSSY_IN = (m: ImageMime | null | undefined) => m === 'image/jpeg' || m === 'image/webp';

export default function WatermarkTool() {
  const allInputs = useToolInputs('watermark');
  const inputs = useMemo(() => allInputs.filter((a) => a.mime.startsWith('image/')), [allInputs]);
  const allAssets = useAssets();
  const logos = useMemo(() => allAssets.filter((a) => a.mime.startsWith('image/')), [allAssets]);
  const [st, set] = useToolState<WatermarkForm>('watermark', INITIAL);
  const sniffed = useSniffed(inputs);
  const support = useEncoderSupport();
  const jobs = useJobs('watermark');
  const selected = inputs.find((a) => a.id === st.selectedId) ?? inputs[0];
  const logo = logos.find((a) => a.id === st.logoId) ?? logos[0];
  const img = usePreviewImage(selected);
  const logoImg = usePreviewImage(st.kind === 'logo' ? logo : undefined);

  const jobFor = (a: SessionAsset): Job | undefined => {
    const id = st.jobByInput[a.id];
    return id ? jobs.find((j) => j.id === id) : undefined;
  };

  const issueOf = (a: SessionAsset): string | undefined => {
    if (!sniffed.has(a.id)) return 'Checking format';
    const m = sniffed.get(a.id);
    if (!m) return 'Not a recognized image';
    if (!isInputMime(m)) return `${m.replace('image/', '').toUpperCase()} is not supported by Watermark. Convert it first.`;
    return undefined;
  };

  const v = toSettings(st);
  const logoNeeded = st.kind === 'logo';
  const logoReady = !logoNeeded || logo !== undefined;
  const runnable = inputs.filter((a) => issueOf(a) === undefined);
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
    removeInput('watermark', a.id);
    set({
      jobByInput: Object.fromEntries(Object.entries(st.jobByInput).filter(([k]) => k !== a.id)),
      selectedId: st.selectedId === a.id ? null : st.selectedId,
    });
  };

  const run = () => {
    if (!v.ok || !logoReady) return;
    const settings = v.settings;
    const logoBlob = st.kind === 'logo' && logo ? logo.blob : null;
    const next = { ...st.jobByInput };
    for (const a of runnable) {
      // Re-running replaces this input's previous result. The original is never touched.
      const prev = jobFor(a);
      if (prev && isActive(prev)) cancelJob(prev.id);
      prev?.result?.assets.forEach((x) => removeAsset(x.id));
      next[a.id] = enqueue({
        toolId: 'watermark',
        label: `Watermark ${a.name}`,
        inputIds: [a.id],
        heavy: true,
        run: async (ctx) => {
          const res = await watermarkImage(a.blob, logoBlob, settings, ctx);
          details.set(res.blob, res);
          return { outputs: [{ name: outputName(a.name, 'watermarked', EXT[res.mime]), mime: res.mime, blob: res.blob }], warnings: res.warnings };
        },
      });
    }
    set({ jobByInput: next, selectedId: selected?.id ?? null });
  };

  const canRun = count > 0 && v.ok && logoReady;

  return (
    <ToolPage
      toolId="watermark"
      settings={
        <div className="pk-stack">
          <h2>Watermark</h2>
          <Segmented<Kind> label="Watermark type" value={st.kind} options={KINDS} onChange={(kind) => set({ kind })} />

          {st.kind === 'text' ? (
            <>
              <Field label="Text">{(p) => <input {...p} className="pk-input" value={st.text} onChange={(e) => set({ text: e.target.value })} />}</Field>
              <div className="wm-row">
                <Field label="Font">
                  {(p) => (
                    <select {...p} className="pk-select" value={st.font} onChange={(e) => set({ font: e.target.value as WatermarkForm['font'] })}>
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Colour">{(p) => <input {...p} type="color" className="pk-input" value={st.color} onChange={(e) => set({ color: e.target.value })} />}</Field>
              </div>
              <label className="wm-check">
                <input type="checkbox" checked={st.bold} onChange={(e) => set({ bold: e.target.checked })} /> Bold
              </label>
            </>
          ) : (
            <div className="pk-stack wm-logo">
              {logos.length > 0 ? (
                <Field label="Logo" hint="Pick an image from this session, or drop one below.">
                  {(p) => (
                    <select {...p} className="pk-select" value={logo?.id ?? ''} onChange={(e) => set({ logoId: e.target.value })}>
                      {logos.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : null}
              <DropZone compact multiple={false} accept="image/*" onAdded={(added) => added[0] && set({ logoId: added[0].id })} />
              <label className="wm-check">
                <input type="checkbox" checked={st.whiteTransparent} onChange={(e) => set({ whiteTransparent: e.target.checked })} /> Make white background transparent
              </label>
              {!logo && <Notice kind="info">Choose a logo to continue.</Notice>}
            </div>
          )}

          <div className="wm-row">
            <Field label="Size (% of shorter side)">
              {(p) => <NumberInput {...p} value={st.sizePct} min={1} max={100} onChange={(sizePct) => set({ sizePct })} />}
            </Field>
            <Field label="Opacity (%)">
              {(p) => (
                <div className="wm-range">
                  <input {...p} type="range" className="pk-range" min={1} max={100} value={st.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
                  <output className="mono">{st.opacity}</output>
                </div>
              )}
            </Field>
          </div>

          <h2>Placement</h2>
          <Segmented<PlaceKind> label="Placement" value={st.placement} options={PLACEMENTS} onChange={(placement) => set({ placement })} />
          {st.placement === 'grid' ? (
            <>
              <div className="wm-grid" role="group" aria-label="Position">
                {POSITIONS.map((p) => (
                  <Button key={p.id} size="sm" aria-label={p.label} aria-pressed={st.position === p.id} onClick={() => set({ position: p.id })}>
                    {st.position === p.id ? '●' : '○'}
                  </Button>
                ))}
              </div>
              <Field label="Margin (% of shorter side)">
                {(p) => <NumberInput {...p} value={st.marginPct} min={0} max={50} onChange={(marginPct) => set({ marginPct })} />}
              </Field>
            </>
          ) : (
            <div className="wm-row">
              <Field label="Spacing (% of shorter side)">
                {(p) => <NumberInput {...p} value={st.spacingPct} min={0} max={100} onChange={(spacingPct) => set({ spacingPct })} />}
              </Field>
              <Field label="Angle (degrees)">
                {(p) => <NumberInput {...p} value={st.angle} min={-90} max={90} onChange={(angle) => set({ angle })} />}
              </Field>
            </div>
          )}
          {!v.ok && <Notice kind="error">{v.error}</Notice>}

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
                <div className="wm-range">
                  <input {...p} type="range" className="pk-range" min={1} max={100} value={st.quality} onChange={(e) => set({ quality: Number(e.target.value) })} />
                  <output className="mono">{st.quality}</output>
                </div>
              )}
            </Field>
          ) : (
            <p className="wm-hint">PNG is lossless: quality does not apply.</p>
          )}

          <Button variant="primary" block disabled={!canRun} onClick={run}>
            {count > 1 ? `Watermark ${count} files` : 'Watermark'}
          </Button>
        </div>
      }
    >
      {inputs.length === 0 ? (
        <DropZone toolId="watermark" />
      ) : (
        <>
          {selected && (
            <section className="wm-preview" aria-label="Watermark preview">
              {img === undefined ? (
                <p className="wm-hint">Loading preview</p>
              ) : img === null ? (
                <Notice kind="warn">This browser cannot preview {selected.name}. It can still be watermarked if the browser can decode it.</Notice>
              ) : (
                <Preview img={img} logo={logoImg ?? null} settings={v.ok && logoReady ? v.settings : null} />
              )}
              {selectedOut && (
                <Button variant="primary" onClick={() => downloadResult(selectedOut)}>
                  Download result
                </Button>
              )}
            </section>
          )}

          <section aria-labelledby="wm-files">
            <h2 id="wm-files">Files · {inputs.length}</h2>
            <ul className="pk-assets">
              {inputs.map((a) => {
                const issue = issueOf(a);
                return (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    exclude="watermark"
                    detail={issue ?? `Detected ${sniffed.get(a.id)?.replace('image/', '').toUpperCase() ?? 'unknown'}`}
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
            <DropZone toolId="watermark" compact multiple />
          </section>

          <section aria-labelledby="wm-results" className="wm-results">
            <h2 id="wm-results">Results</h2>
            {inputs.map((a) => (
              <ResultBlock key={a.id} input={a} job={jobFor(a)} />
            ))}
          </section>
        </>
      )}
    </ToolPage>
  );
}

function NumberInput({ id, value, min, max, onChange, ...rest }: { id: string; value: number; min: number; max: number; onChange: (v: number) => void } & Record<string, unknown>) {
  return (
    <input
      {...rest}
      id={id}
      className="pk-input"
      type="number"
      min={min}
      max={max}
      step={1}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value.trim() === '' ? NaN : Number(e.target.value))}
    />
  );
}

function downloadResult(a: SessionAsset) {
  const url = assetUrl(a);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.name;
  link.click();
}

function outputOf(job: Job | undefined): SessionAsset | undefined {
  return job?.state === 'complete' ? job.result?.assets[0] : undefined;
}

/** Decoded image: undefined while loading, null when this browser cannot show it. */
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

/** Live preview: the same drawing code as the worker, at a smaller size. Layout is relative, so it matches. */
function Preview({ img, logo, settings }: { img: HTMLImageElement; logo: HTMLImageElement | null; settings: WatermarkSettings | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [interReady, setInterReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadInter().then((ok) => alive && setInterReady(ok));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const scale = Math.min(1, PREVIEW_MAX / img.naturalWidth);
    const W = Math.max(1, Math.round(img.naturalWidth * scale));
    const H = Math.max(1, Math.round(img.naturalHeight * scale));
    c.width = W;
    c.height = H;
    const cx = c.getContext('2d');
    if (!cx) return;
    cx.drawImage(img, 0, 0, W, H);
    if (!settings) return setError(null);
    try {
      const logoSrc =
        settings.content.kind === 'logo' && logo
          ? { src: prepareLogo(logo, logo.naturalWidth, logo.naturalHeight, settings.content.whiteTransparent), w: logo.naturalWidth, h: logo.naturalHeight }
          : null;
      const font = settings.content.kind === 'text' ? settings.content.font : 'sans';
      drawWatermark(cx, W, H, { settings, logo: logoSrc, fontCss: fontCss(font, interReady) });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The preview could not be drawn.');
    }
  }, [img, logo, settings, interReady]);
  return (
    <>
      <canvas ref={ref} role="img" aria-label="Image with watermark applied" />
      {error && <Notice kind="error">{error}</Notice>}
      {!settings && <p className="wm-hint">Fix the highlighted setting to see the watermark.</p>}
    </>
  );
}

function ResultBlock({ input, job }: { input: SessionAsset; job: Job | undefined }) {
  if (!job) return null;
  const out = outputOf(job);
  const d = out ? details.get(out.blob) : undefined;
  return (
    <article className="pk-stack wm-result" aria-label={input.name}>
      <div className="pk-row" style={{ justifyContent: 'space-between' }}>
        <h3 className="wm-name">{input.name}</h3>
        <JobBadge job={job} />
      </div>
      {job.state !== 'complete' && <JobStatus job={job} />}
      {out && d && (
        <>
          <p className="mono">
            {d.width} × {d.height} px kept · {formatBytes(input.size)} → {formatBytes(out.size)} · {d.copies === 1 ? 'one position' : `${d.copies} copies`}
          </p>
          {job.result?.warnings.length ? (
            <ul className="wm-hint">
              {job.result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <ul className="pk-assets">
            <AssetRow asset={out} exclude="watermark" detail={d.quality !== null ? `quality ${Math.round(d.quality * 100)}` : undefined} />
          </ul>
        </>
      )}
    </article>
  );
}
