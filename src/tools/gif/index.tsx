import { useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice } from '@/components/ui';
import { assetUrl, removeInput, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { formatBytes, outputName } from '@/lib/format';
import { useSniffed } from '@/engines/image/hooks';
import { exportGif } from '@/engines/gif/client';
import { buildPlan, moveEntry, reconcileEntries, removeEntry, reverseEntries, setAllMs, setEntryMs, totalMs } from '@/engines/gif/model';
import { centredCrop, cropRect, outputSize } from '@/engines/gif/geometry';
import { GIF_LIMITS, type Crop, type Entry, type FrameSpec, type GifOptions } from '@/engines/gif/types';
import { useProbe, type ProbeInput } from './useProbe';
import { FrameStrip } from './FrameStrip';
import { Preview } from './Preview';
import './gif.css';

type CropMode = 'full' | '1:1' | '4:3' | '16:9' | 'custom';
const RATIO: Record<Exclude<CropMode, 'full' | 'custom'>, number> = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };

type Stored = {
  startText: string;
  endText: string;
  fps: number;
  speed: number;
  skip: number;
  widthText: string;
  cropMode: CropMode;
  custom: Crop;
  colors: 64 | 128 | 256;
  loop: boolean;
  /** Which source the frame list belongs to. A different source starts from the defaults. */
  sourceKey: string | null;
  entries: Entry[];
};
const INITIAL: Stored = {
  startText: '0',
  endText: '',
  fps: 10,
  speed: 1,
  skip: 1,
  widthText: '',
  cropMode: 'full',
  custom: { x: 0, y: 0, w: 100, h: 100 },
  colors: 256,
  loop: true,
  sourceKey: null,
  entries: [],
};

const SUPPORTED = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const FPS = [5, 8, 10, 12, 15, 20, 24, 30];
const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
const SKIPS = [1, 2, 3, 4];
const COLORS: (64 | 128 | 256)[] = [256, 128, 64];

/** Export result details, keyed by blob, for the summary line under the result. */
const resultInfo = new WeakMap<Blob, { width: number; height: number; frames: number }>();

const clampPct = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));

export default function Tool() {
  const inputs = useToolInputs('gif');
  const [st, set] = useToolState<Stored>('gif', INITIAL);
  const [setAllText, setSetAllText] = useState('');
  const video = inputs.find((a) => a.mime.startsWith('video/'));
  const stills = useMemo(() => (video ? [] : inputs), [inputs, video]);
  const sniffed = useSniffed(stills);
  const pending = stills.some((a) => !sniffed.has(a.id));
  const usable = stills.filter((a) => {
    const m = sniffed.get(a.id);
    return m !== undefined && m !== null && SUPPORTED.has(m);
  });
  const unusable = stills.filter((a) => {
    const m = sniffed.get(a.id);
    return m !== undefined && (m === null || !SUPPORTED.has(m));
  });

  // Trim and frame rate only apply to video. Parsing happens here so the probe key changes exactly when the source does.
  const start = Number(st.startText || 0);
  const endTrim = st.endText.trim();
  const end = endTrim === '' ? null : Number(endTrim);
  const trimError = video
    ? !(start >= 0 && Number.isFinite(start))
      ? 'Start must be 0 or more.'
      : end !== null && !(end > start)
        ? 'The end must be after the start.'
        : undefined
    : undefined;

  const input: ProbeInput | null = useMemo(() => {
    if (video) {
      if (trimError) return null;
      const spec: FrameSpec = { kind: 'video', blob: video.blob, startSec: start, endSec: end, fps: st.fps };
      const k = `v|${video.id}|${start}|${end}|${st.fps}`;
      return { spec, key: k, sourceKey: k };
    }
    if (pending || usable.length === 0) return null;
    const spec: FrameSpec = { kind: 'stills', items: usable.map((a) => ({ id: a.id, name: a.name, blob: a.blob })) };
    const k = `s|${usable.map((a) => a.id).join(',')}`;
    return { spec, key: k, sourceKey: 's' };
    // Rebuild only when the probe key changes; the spec is fully determined by it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, video?.blob, start, end, st.fps, trimError, pending, usable.map((a) => a.id).join(',')]);

  const probe = useProbe(input);
  const fresh = probe.status === 'ready' && probe.result !== null && input !== null && probe.key === input.key;

  // A new read adds frames the list has not seen, keeps the order and durations of the rest, and resets when the source changes.
  useEffect(() => {
    if (probe.status !== 'ready' || !probe.result || probe.sourceKey === null) return;
    const sk = probe.sourceKey;
    const probed = probe.result.frames.map((f) => ({ id: f.id, ms: f.ms }));
    set((s) => ({ ...s, sourceKey: sk, entries: reconcileEntries(s.sourceKey === sk ? s.entries : [], probed) }));
  }, [probe, set]);

  const frames = useMemo(() => new Map((probe.result?.frames ?? []).map((f) => [f.id, f])), [probe.result]);
  const entries = useMemo(() => st.entries.filter((e) => frames.has(e.id)), [st.entries, frames]);
  const plan = useMemo(() => buildPlan(entries, { speed: st.speed, skip: st.skip }), [entries, st.speed, st.skip]);

  const widthNum = st.widthText.trim() === '' ? null : Number(st.widthText);
  const widthError =
    widthNum !== null && !(Number.isInteger(widthNum) && widthNum >= 16 && widthNum <= 1920) ? 'Width must be a whole number from 16 to 1920.' : undefined;
  const width = widthError || widthNum === null ? null : widthNum;

  const crop: Crop | null = useMemo(() => {
    if (st.cropMode === 'full') return null;
    if (st.cropMode === 'custom') return st.custom;
    return centredCrop(probe.result?.fullWidth || 1, probe.result?.fullHeight || 1, RATIO[st.cropMode]);
  }, [st.cropMode, st.custom, probe.result]);

  const fullW = probe.result?.fullWidth ?? 0;
  const fullH = probe.result?.fullHeight ?? 0;
  const outFull = fullW && fullH ? (() => {
    const r = cropRect(fullW, fullH, crop);
    return outputSize(r.w, r.h, width);
  })() : null;

  const memoryBlock = outFull && plan.length * outFull.w * outFull.h > GIF_LIMITS.maxExportPixels
    ? `${plan.length} frames at ${outFull.w}×${outFull.h} is more than the memory limit allows. Lower the width, crop, or remove frames.`
    : undefined;
  const blocker = !input
    ? trimError ?? (pending ? 'Checking the files.' : stills.length === 0 && !video ? 'Add images, a GIF or a video to start.' : usable.length === 0 && !video ? 'None of the files can be used. See the notice above.' : undefined)
    : probe.status === 'error'
      ? 'The frames could not be read.'
      : !fresh || probe.sourceKey !== st.sourceKey
        ? 'Reading frames…'
        : plan.length === 0
          ? 'Keep at least one frame.'
          : widthError ?? memoryBlock;

  const exportNow = () => {
    if (!input || blocker || !outFull) return;
    const options: GifOptions = { width, crop, colors: st.colors, loop: st.loop };
    const planNow = plan;
    const spec = input.spec;
    const base = video?.name ?? stills[0]?.name ?? 'animation';
    const name = outputName(base, 'gif', 'gif');
    enqueue({
      toolId: 'gif',
      label: `Make ${name}`,
      inputIds: inputs.map((a) => a.id),
      heavy: true,
      run: async (ctx) => {
        const r = await exportGif(spec, planNow, options, ctx);
        const blob = new Blob([r.bytes as BlobPart], { type: 'image/gif' });
        resultInfo.set(blob, { width: r.width, height: r.height, frames: r.frames });
        return { outputs: [{ name, mime: 'image/gif', blob }], warnings: r.warnings };
      },
    });
  };

  const jobs = useJobs('gif');
  const lastDone = [...jobs].reverse().find((j) => j.state === 'complete' && j.result?.assets[0]);
  const lastAsset = lastDone?.result?.assets[0];
  const lastInfo = lastAsset ? resultInfo.get(lastAsset.blob) : undefined;
  const shown = jobs.filter((j) => isActive(j) || j.state === 'failed' || j.state === 'canceled').slice(-2);

  const move = (from: number, to: number) => set({ entries: moveEntry(entries, from, to) });
  const remove = (i: number) => set({ entries: removeEntry(entries, i) });
  const setMs = (i: number, ms: number) => set({ entries: setEntryMs(entries, i, ms) });

  const settings = (
    <div className="pk-stack gif-settings">
      <h2>Settings</h2>
      {video && (
        <>
          <Field label="Start (seconds)" hint="Changing the trim or frame rate reads the frames again and resets the order and durations.">
            {(p) => <input {...p} className="pk-input" type="number" min={0} step={0.1} value={st.startText} onChange={(e) => set({ startText: e.target.value })} />}
          </Field>
          <Field label="End (seconds)" hint="Leave empty to use the end of the video.">
            {(p) => <input {...p} className="pk-input" type="number" min={0} step={0.1} placeholder="End of video" value={st.endText} onChange={(e) => set({ endText: e.target.value })} />}
          </Field>
          <Field label="Frame rate">
            {(p) => (
              <select {...p} className="pk-select" value={st.fps} onChange={(e) => set({ fps: Number(e.target.value) })}>
                {FPS.map((f) => (
                  <option key={f} value={f}>
                    {f} frames per second
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      )}
      <Field label="Speed">
        {(p) => (
          <select {...p} className="pk-select" value={st.speed} onChange={(e) => set({ speed: Number(e.target.value) })}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Frame skip" hint="Keeps every Nth frame and gives it N times the duration, to make a smaller file.">
        {(p) => (
          <select {...p} className="pk-select" value={st.skip} onChange={(e) => set({ skip: Number(e.target.value) })}>
            {SKIPS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'Keep every frame' : `Keep every ${n === 2 ? '2nd' : n === 3 ? '3rd' : '4th'} frame`}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Width (pixels)" error={widthError} hint={widthError ? undefined : 'Height follows the aspect ratio. Leave empty to keep the original size.'}>
        {(p) => <input {...p} className="pk-input" type="number" inputMode="numeric" min={16} max={1920} placeholder="Original" value={st.widthText} onChange={(e) => set({ widthText: e.target.value })} />}
      </Field>
      <Field label="Crop">
        {(p) => (
          <select {...p} className="pk-select" value={st.cropMode} onChange={(e) => set({ cropMode: e.target.value as CropMode })}>
            <option value="full">Full frame</option>
            <option value="1:1">Square 1:1, centred</option>
            <option value="4:3">Landscape 4:3, centred</option>
            <option value="16:9">Widescreen 16:9, centred</option>
            <option value="custom">Custom rectangle</option>
          </select>
        )}
      </Field>
      {st.cropMode === 'custom' && (
        <div className="gif-crop">
          {(['x', 'y', 'w', 'h'] as const).map((k) => {
            const label = { x: 'Left', y: 'Top', w: 'Width', h: 'Height' }[k];
            return (
              <label key={k} className="gif-crop__field">
                <span>Crop {label.toLowerCase()} (%)</span>
                <input
                  className="pk-input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(st.custom[k] * 10) / 10}
                  onChange={(e) => {
                    const v = clampPct(Number(e.target.value));
                    set({ custom: { ...st.custom, [k]: k === 'w' || k === 'h' ? Math.max(1, v) : v } });
                  }}
                />
              </label>
            );
          })}
        </div>
      )}
      <Field label="Colors per frame" hint="Fewer colors make a smaller file and more banding.">
        {(p) => (
          <select {...p} className="pk-select" value={st.colors} onChange={(e) => set({ colors: Number(e.target.value) as 64 | 128 | 256 })}>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c} colors{c === 256 ? ' (best)' : ''}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="gif-check">
        <input type="checkbox" checked={st.loop} onChange={(e) => set({ loop: e.target.checked })} /> Loop forever
      </label>
      {blocker && <Notice>{blocker}</Notice>}
      <Button variant="primary" block disabled={!!blocker} onClick={exportNow}>
        Make GIF
      </Button>
    </div>
  );

  return (
    <ToolPage toolId="gif" settings={settings}>
      <DropZone
        toolId="gif"
        compact={inputs.length > 0}
        hint={video ? 'One video is used. Images added here are ignored while a video is in the list.' : 'A video, several images, or an animated GIF. Files stay on this device.'}
      />

      {inputs.length > 0 && (
        <ul className="pk-assets" aria-label="Files in this GIF">
          {inputs.map((a) => (
            <AssetRow key={a.id} asset={a} onRemove={(x) => removeInput('gif', x.id)} />
          ))}
        </ul>
      )}
      {video && inputs.length > 1 && (
        <Notice>Video mode: only {video.name} is used. Images in the list are not. Remove the video to make a GIF from images.</Notice>
      )}
      {unusable.length > 0 && (
        <Notice kind="warn">
          Not used: {unusable.map((a) => a.name).join(', ')}. Only GIF, PNG, JPEG and WebP images can be used here.
        </Notice>
      )}
      {probe.status === 'error' && probe.error && (
        <Notice kind="error">
          <strong>{probe.error.message}</strong>
          {probe.error.nextAction ? <div>{probe.error.nextAction}</div> : null}
        </Notice>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {probe.status === 'ready' && fresh && probe.result ? `${probe.result.frames.length} frames ready.` : ''}
      </p>
      {probe.status === 'loading' && <p className="muted">Reading frames…</p>}

      {fresh && probe.result && plan.length > 0 && (
        <Preview frames={frames} plan={plan} probe={probe.result} crop={crop} width={width} loop={st.loop} />
      )}

      {fresh && probe.result && (
        <section aria-labelledby="gif-frames-h" className="gif-section">
          <div className="gif-section__head">
            <h2 id="gif-frames-h">Frames</h2>
            <span className="mono muted">
              {entries.length} frames · {(totalMs(plan) / 1000).toFixed(2)} s at {st.speed}×
            </span>
          </div>
          {probe.result.warnings.map((w) => (
            <Notice key={w} kind="warn">
              {w}
            </Notice>
          ))}
          <div className="gif-tools">
            <Button size="sm" onClick={() => set({ entries: reverseEntries(entries) })} disabled={entries.length < 2}>
              Reverse order
            </Button>
            <label className="gif-tools__set">
              <span>Set all durations (ms)</span>
              <input
                className="pk-input"
                type="number"
                inputMode="numeric"
                min={GIF_LIMITS.minDelayMs}
                max={GIF_LIMITS.maxDelayMs}
                value={setAllText}
                onChange={(e) => setSetAllText(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              disabled={!setAllText || !Number.isFinite(Number(setAllText)) || entries.length === 0}
              onClick={() => set({ entries: setAllMs(entries, Number(setAllText)) })}
            >
              Apply to all
            </Button>
          </div>
          {entries.length === 0 ? (
            <Notice>All frames were removed. Re-add images or change the source to start again.</Notice>
          ) : (
            <FrameStrip entries={entries} frames={frames} onMove={move} onRemove={remove} onMs={setMs} />
          )}
        </section>
      )}

      {shown.map((j) => (
        <JobStatus key={j.id} job={j} />
      ))}

      {lastAsset && lastInfo && (
        <section aria-labelledby="gif-out-h" className="gif-section">
          <h2 id="gif-out-h">Result</h2>
          <img className="gif-result" src={assetUrl(lastAsset)} alt={`Animated GIF ${lastAsset.name}, ${lastInfo.frames} frames`} />
          <p className="mono muted">
            {lastInfo.width}×{lastInfo.height} · {lastInfo.frames} frames · {formatBytes(lastAsset.size)}
          </p>
          {lastDone?.result?.warnings.map((w) => (
            <Notice key={w} kind="info">
              {w}
            </Notice>
          ))}
          <ul className="pk-assets">
            <AssetRow asset={lastAsset} />
          </ul>
        </section>
      )}
    </ToolPage>
  );
}
