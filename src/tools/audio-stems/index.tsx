import { useEffect, useRef } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { assetUrl, removeInput, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { formatBytes, outputName } from '@/lib/format';
import { extractAudio, SAMPLE_RATES, type ExtractResult, type SampleRate } from '@/engines/audio/extract';
import type { Peaks } from '@/engines/audio/peaks';
import './audio-stems.css';

type Stored = { sampleRate: SampleRate; mono: boolean; startText: string; endText: string };
const INITIAL: Stored = { sampleRate: 48000, mono: false, startText: '', endText: '' };

/** Extra data for each output, keyed by its blob. Released with the asset. */
const details = new WeakMap<Blob, ExtractResult>();

/** Empty means no trim. Returns an error message, or null when valid. */
function trimError(s: string, label: string): string | null {
  if (s.trim() === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return `${label} must be a number of seconds, 0 or more.`;
  return null;
}
const secs = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));
const channelsLabel = (n: number) => (n === 1 ? 'mono' : n === 2 ? 'stereo' : `${n} channels`);

export default function Tool() {
  const inputs = useToolInputs('audio-stems');
  const [st, set] = useToolState<Stored>('audio-stems', INITIAL);
  const jobs = useJobs('audio-stems');
  const asset = inputs[0];
  const startErr = trimError(st.startText, 'Start');
  const endErr = trimError(st.endText, 'End');
  const trimBad = !!startErr || !!endErr || (secs(st.startText) !== undefined && secs(st.endText) !== undefined && secs(st.endText)! <= secs(st.startText)!);
  const endOrderErr = !startErr && !endErr && trimBad ? 'End must be later than start.' : undefined;

  const extract = (a: SessionAsset) => {
    const opts = { sampleRate: st.sampleRate, mono: st.mono, startSec: secs(st.startText), endSec: secs(st.endText) };
    enqueue({
      toolId: 'audio-stems',
      label: `Extract audio ${a.name}`,
      inputIds: [a.id],
      heavy: true,
      run: async (ctx) => {
        const r = await extractAudio(a.blob, outputName(a.name, 'audio', 'wav'), opts, ctx);
        details.set(r.outputs[0]!.blob, r);
        return r;
      },
    });
  };

  const settings = (
    <div className="pk-stack">
      <h2>Extraction</h2>
      <Field label="Sample rate" hint={`Audio is resampled to ${st.sampleRate} Hz by the browser decoder.`}>
        {(p) => (
          <select {...p} className="pk-select" value={st.sampleRate} onChange={(e) => set({ sampleRate: Number(e.target.value) as SampleRate })}>
            {SAMPLE_RATES.map((r) => (
              <option key={r} value={r}>
                {r} Hz
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Channels">
        {() => (
          <Segmented<'stereo' | 'mono'>
            label="Channels"
            value={st.mono ? 'mono' : 'stereo'}
            options={[
              { value: 'stereo', label: 'Keep' },
              { value: 'mono', label: 'Mono' },
            ]}
            onChange={(v) => set({ mono: v === 'mono' })}
          />
        )}
      </Field>
      <Field label="Start (seconds)" error={startErr ?? undefined} hint={startErr ? undefined : 'Empty means from the beginning.'}>
        {(p) => <input {...p} className="pk-input" inputMode="decimal" value={st.startText} onChange={(e) => set({ startText: e.target.value })} />}
      </Field>
      <Field label="End (seconds)" error={endErr ?? endOrderErr} hint={endErr || endOrderErr ? undefined : 'Empty means to the end.'}>
        {(p) => <input {...p} className="pk-input" inputMode="decimal" value={st.endText} onChange={(e) => set({ endText: e.target.value })} />}
      </Field>
      <Button variant="primary" block disabled={!asset || trimBad} onClick={() => asset && extract(asset)}>
        Extract audio (WAV)
      </Button>
    </div>
  );

  return (
    <ToolPage toolId="audio-stems" settings={settings}>
      {asset ? (
        <>
          <section aria-labelledby="as-src-h" className="as-section">
            <h2 id="as-src-h">Source</h2>
            <p className="mono muted">
              {asset.name} · {asset.mime} · {formatBytes(asset.size)}
            </p>
            <audio controls preload="metadata" src={assetUrl(asset)} className="as-audio">
              Your browser cannot play this file. Audio extraction can still be tried.
            </audio>
            <div className="pk-row">
              <Button size="sm" variant="ghost" onClick={() => removeInput('audio-stems', asset.id)}>
                Remove from this tool
              </Button>
            </div>
          </section>

          <section aria-labelledby="as-res-h" className="as-section">
            <h2 id="as-res-h">Results</h2>
            {jobs.filter((j) => j.inputIds.includes(asset.id)).length === 0 && <p className="muted">Extracted WAV files appear here.</p>}
            {jobs
              .filter((j) => j.inputIds.includes(asset.id))
              .map((j) => {
                if (j.state !== 'complete' || !j.result) return <JobStatus key={j.id} job={j} />;
                return (
                  <div key={j.id} className="as-result">
                    {j.result.assets.map((out) => {
                      const d = details.get(out.blob);
                      const detail = d ? `${d.info.durationSec.toFixed(2)} s · ${channelsLabel(d.info.channels)} · ${d.info.sampleRate} Hz` : undefined;
                      return (
                        <ul key={out.id} className="pk-assets">
                          <AssetRow asset={out} exclude="audio-stems" detail={detail} />
                        </ul>
                      );
                    })}
                    {j.result.assets.map((out) => {
                      const d = details.get(out.blob);
                      return d ? <ResultDetail key={`d-${out.id}`} url={assetUrl(out)} info={d.info} peaks={d.peaks} warnings={j.result!.warnings} /> : null;
                    })}
                  </div>
                );
              })}
            {jobs.some((j) => isActive(j) && j.inputIds.includes(asset.id)) && <p className="muted">Working. You can leave this page and come back; the job keeps running.</p>}
          </section>
        </>
      ) : (
        <DropZone toolId="audio-stems" multiple={false} hint="Video or audio file. Processed in this browser. Nothing is uploaded." />
      )}

      <section aria-labelledby="stems-h" className="as-section as-stems">
        <h2 id="stems-h">Stem separation</h2>
        <Notice>Not available. Separating vocals and instruments needs a local AI model that has not been verified for licence, memory use and quality in this app yet.</Notice>
      </section>
    </ToolPage>
  );
}

function ResultDetail({ url, info, peaks, warnings }: { url: string; info: ExtractResult['info']; peaks: Peaks; warnings: string[] }) {
  return (
    <div className="as-detail">
      <audio controls preload="metadata" src={url} className="as-audio">
        Your browser cannot play this file.
      </audio>
      <Waveform peaks={peaks} />
      <p className="mono muted">
        Waveform: {info.durationSec.toFixed(2)} s, {channelsLabel(info.channels)}, {info.sampleRate} Hz. Audio is resampled to {info.sampleRate} Hz by the browser decoder.
      </p>
      {warnings.map((w) => (
        <Notice key={w} kind="warn">
          {w}
        </Notice>
      ))}
    </div>
  );
}

function Waveform({ peaks }: { peaks: Peaks }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = getComputedStyle(c).getPropertyValue('--text-2').trim() || '#b7bdb6';
    ctx.beginPath();
    const n = peaks.max.length;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (w / n);
      ctx.moveTo(x, ((1 - peaks.max[i]!) / 2) * h);
      ctx.lineTo(x, ((1 - peaks.min[i]!) / 2) * h);
    }
    ctx.stroke();
  }, [peaks]);
  return <canvas ref={ref} width={800} height={120} className="as-wave" aria-hidden />;
}
