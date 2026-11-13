import { useEffect, useState } from 'react';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Notice } from '@/components/ui';
import { assetUrl, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { formatBytes } from '@/lib/format';
import { probeDuration } from '@/engines/audio/extract';
import { hasWasmSimd } from '@/engines/cutout/client';
import { cachedBytes, deleteStemCache, estimateIsMeasured, estimateSeconds, isModelLoaded, separateStems } from '@/engines/stems/client';
import { ENGINE, MAX_SECONDS, MODEL, STEM_NAMES } from '@/engines/stems/model';

/** Label prefix that tells stem jobs apart from extraction jobs in the shared tool job list. */
export const STEM_JOB_PREFIX = 'Separate stems';
const minutes = (sec: number) => (sec < 90 ? `${Math.max(1, Math.round(sec))} seconds` : `${Math.round(sec / 60)} minutes`);

export function StemPanel() {
  const asset = useToolInputs('audio-stems')[0];
  const [st, set] = useToolState<{ keep: boolean }>('audio-stems-stems', { keep: false });
  const jobs = useJobs('audio-stems').filter((j) => j.label.startsWith(STEM_JOB_PREFIX) && asset && j.inputIds.includes(asset.id));
  const [duration, setDuration] = useState<number | null | undefined>(undefined); // undefined = still probing
  const [cached, setCached] = useState(0);
  const [msg, setMsg] = useState('');
  const [simd] = useState(hasWasmSimd);
  const total = MODEL.bytes + ENGINE.bytes;
  const refresh = () => void cachedBytes().then(setCached);

  useEffect(refresh, []);
  useEffect(() => {
    let live = true;
    setDuration(undefined);
    if (asset) void probeDuration(asset.blob).then((d) => live && setDuration(d));
    return () => {
      live = false;
    };
  }, [asset]);

  const tooLong = duration != null && duration > MAX_SECONDS;
  const busy = jobs.some(isActive);
  const run = () => {
    if (!asset) return;
    enqueue({
      toolId: 'audio-stems',
      label: `${STEM_JOB_PREFIX} ${asset.name}`,
      inputIds: [asset.id],
      heavy: true,
      run: async (ctx) => {
        const r = await separateStems(asset.blob, asset.name, st.keep, ctx);
        if (st.keep) refresh();
        return r;
      },
    });
  };

  return (
    <section aria-labelledby="stems-h" className="as-section as-stems">
      <h2 id="stems-h">
        Stem separation <span className="as-tag">Experimental</span>
      </h2>
      <p className="as-hint">
        Splits a song into {STEM_NAMES.join(', ')} with a small AI model that runs in this browser. Your audio is never uploaded.
      </p>
      <dl className="as-facts">
        <dt>Model</dt>
        <dd>
          {MODEL.name} · <a href={MODEL.licenceUrl} target="_blank" rel="noreferrer">{MODEL.licence}</a>
        </dd>
        <dt>Download</dt>
        <dd className="mono">
          {isModelLoaded() ? 'Loaded for this session' : `${formatBytes(total)} on first use (model ${formatBytes(MODEL.bytes)}, engine ${formatBytes(ENGINE.bytes)})`}
        </dd>
        <dt>Output</dt>
        <dd>
          One 16-bit WAV per stem, {MODEL.sampleRate / 1000} kHz ({STEM_NAMES.length} files). Audio is resampled to {MODEL.sampleRate / 1000} kHz first.
        </dd>
        <dt>Limit</dt>
        <dd>Up to {MAX_SECONDS / 60} minutes of audio.</dd>
      </dl>
      <label className="pk-check">
        <input type="checkbox" checked={st.keep} onChange={(e) => set({ keep: e.target.checked })} />
        Keep the model on this device for next time
      </label>
      <p className="as-hint">
        {cached ? `Kept on this device: ${formatBytes(cached)}.` : 'Nothing kept on this device.'} Your audio is never stored.{' '}
        <Button
          size="sm"
          disabled={!cached}
          onClick={async () => {
            await deleteStemCache();
            setMsg('Downloaded model deleted from this device.');
            refresh();
          }}
        >
          Delete downloaded model
        </Button>
      </p>
      <p className="as-hint" aria-live="polite">
        {msg}
      </p>

      {!simd && <Notice kind="warn">This browser does not support WebAssembly SIMD, which the engine needs. Stem separation is unavailable here.</Notice>}
      {tooLong && (
        <Notice kind="error">
          This audio is {(duration! / 60).toFixed(1)} minutes long; the limit is {MAX_SECONDS / 60} minutes. Trim it with Extraction above (start and end), then separate the result.
        </Notice>
      )}
      {asset && duration != null && !tooLong && (
        <p className="as-hint">
          Length {duration.toFixed(1)} s. Estimated time: about {minutes(estimateSeconds(duration))}{' '}
          {estimateIsMeasured() ? '(estimate from the last run in this tab)' : '(rough estimate from a test machine; this device may be slower or faster)'}.
        </p>
      )}
      {asset ? (
        <div className="pk-row">
          <Button variant="primary" disabled={!simd || tooLong || busy} onClick={run}>
            Separate into {STEM_NAMES.length} stems
          </Button>
        </div>
      ) : (
        <p className="as-hint">Add an audio or video file above to separate it.</p>
      )}
      <Notice>Separation is imperfect: expect bleed between stems and artefacts.</Notice>

      {jobs.map((j) => {
        if (j.state !== 'complete' || !j.result) return <JobStatus key={j.id} job={j} />;
        return (
          <div key={j.id} className="as-result">
            {j.result.warnings.map((w) => (
              <Notice key={w} kind="warn">
                {w}
              </Notice>
            ))}
            {j.result.assets.map((out, i) => (
              <div key={out.id} className="as-stem" data-stem={STEM_NAMES[i]}>
                <h3>{STEM_NAMES[i]}</h3>
                <audio controls preload="metadata" src={assetUrl(out)} className="as-audio" aria-label={`${STEM_NAMES[i]} stem`}>
                  Your browser cannot play this file.
                </audio>
                <ul className="pk-assets">
                  <AssetRow asset={out} exclude="audio-stems" detail={`${MODEL.sampleRate / 1000} kHz · 16-bit`} />
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
