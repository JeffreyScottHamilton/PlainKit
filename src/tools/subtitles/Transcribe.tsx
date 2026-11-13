import { useEffect, useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { JobStatus } from '@/components/JobStatus';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { useToolState } from '@/session/toolState';
import { formatBytes } from '@/lib/format';
import type { Cue } from '@/engines/subtitles/model';
import { ENGINE, MAX_SECONDS, MODEL_BYTES, WARN_SECONDS, WHISPER } from '@/engines/transcribe/model';
import { engineAvailable, transcribe } from '@/engines/transcribe/client';
import { probeDuration } from '@/engines/audio/extract';

type Pending = { cues: Cue[]; audioSec: number; tookSec: number; warnings: string[] };
type Tx = { file: File | null; keep: boolean; durationSec: number | null; probing: boolean; pending: Pending | null; summary: string | null; timing: string | null };
const INITIAL: Tx = { file: null, keep: false, durationSec: null, probing: false, pending: null, summary: null, timing: null };

const minutes = (s: number) => Math.round(s / 60);
const sec = (s: number) => (s < 10 ? s.toFixed(1) : String(Math.round(s)));

/**
 * Optional speech transcription. The result is handed to onApply: immediately when the editor is empty,
 * otherwise only after the user picks "Replace current subtitles".
 */
export function Transcribe({ hasCues, onApply }: { hasCues: boolean; onApply: (cues: Cue[]) => void }) {
  const [tx, setTx] = useToolState<Tx>('subtitles-transcribe', INITIAL);
  const jobs = useJobs('subtitles').filter((j) => j.label.startsWith('Transcribe'));
  const job = jobs[jobs.length - 1];
  const busy = !!job && isActive(job);
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void engineAvailable().then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);

  // Nothing to overwrite: apply at once. Otherwise the confirm notice below decides.
  const pending = tx.pending;
  useEffect(() => {
    if (pending && !hasCues) {
      onApply(pending.cues);
      setTx({ pending: null, summary: `Loaded ${pending.cues.length} cues. Check every line.` });
    }
  }, [pending, hasCues, onApply, setTx]);

  const pick = async (file: File | null) => {
    setTx({ file, durationSec: null, probing: !!file, pending: null, summary: null, timing: null });
    if (!file) return;
    const d = await probeDuration(file);
    setTx((s) => (s.file === file ? { ...s, durationSec: d, probing: false } : s));
  };

  // A picker opened from the button, so this section adds no second file input to the page.
  const chooseFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,video/*';
    input.onchange = () => void pick(input.files?.[0] ?? null);
    input.click();
  };

  const start = () => {
    const file = tx.file;
    if (!file) return;
    const keep = tx.keep;
    setTx({ pending: null, summary: null, timing: null });
    enqueue({
      toolId: 'subtitles',
      label: `Transcribe ${file.name}`,
      inputIds: [],
      heavy: true,
      run: async (ctx) => {
        const r = await transcribe(file, keep, ctx);
        setTx({ pending: r, timing: `Transcribed ${sec(r.audioSec)} s of audio in ${sec(r.tookSec)} s on this device.` });
        return { outputs: [], warnings: r.warnings };
      },
    });
  };

  const tooLong = tx.durationSec !== null && tx.durationSec > MAX_SECONDS;
  const long = tx.durationSec !== null && tx.durationSec > WARN_SECONDS && !tooLong;
  const complete = job?.state === 'complete';
  const warnings = complete ? (job.result?.warnings ?? []) : [];

  return (
    <section className="sub-section" aria-labelledby="sub-tx-h">
      <h2 id="sub-tx-h">Transcribe audio or video (experimental)</h2>
      {available === false ? (
        <Notice kind="warn">
          Transcription is not available in this copy of the app: the speech engine files are missing from this site. Nothing was changed.
        </Notice>
      ) : (
        <>
          <p className="sub-muted">
            Turns speech in an audio or video file into editable cues. It runs on this device: the file is not uploaded. Audio is decoded and resampled to 16 kHz mono for recognition.
          </p>
          <ul className="sub-muted">
            <li>Model: {WHISPER.name}, from this site.</li>
            <li>
              Download on first use: {formatBytes(MODEL_BYTES + ENGINE.bytes)} ({formatBytes(MODEL_BYTES)} model, {formatBytes(ENGINE.bytes)} speech engine). It is held in memory for this tab unless you keep it.
            </li>
            <li>
              Licence: {WHISPER.licence}. <a href={WHISPER.licenceUrl} target="_blank" rel="noreferrer">Licence text</a>.
            </li>
            <li>Language: {WHISPER.languages}. Other languages will come out wrong.</li>
            <li>Length: up to {MAX_SECONDS / 60} minutes of audio. Single-threaded, so it is slower than real time on many devices.</li>
          </ul>
          <div className="sub-actions">
            <Button disabled={busy} onClick={chooseFile}>
              Choose audio or video file
            </Button>
            <span className="sub-muted" aria-live="polite">
              {tx.file ? tx.file.name : 'No file chosen'}
            </span>
          </div>
          <label className="pk-check">
            <input type="checkbox" checked={tx.keep} disabled={busy} onChange={(e) => setTx({ keep: e.target.checked })} />
            Keep the model on this device for next time ({formatBytes(MODEL_BYTES)}; remove it in Settings)
          </label>
          {tx.file && tx.durationSec !== null && <p className="sub-muted">Length: {sec(tx.durationSec)} s</p>}
          {tooLong && (
            <Notice kind="error">
              This recording is about {minutes(tx.durationSec!)} minutes long. Transcription accepts up to {MAX_SECONDS / 60} minutes. Trim it first, then choose it again.
            </Notice>
          )}
          {long && <Notice kind="warn">This recording is about {minutes(tx.durationSec!)} minutes long. Transcription can take a long time on this device, and you can cancel at any time.</Notice>}
          <div className="sub-actions">
            <Button variant="primary" onClick={start} disabled={!tx.file || tooLong || busy || tx.probing || available === null}>
              Transcribe
            </Button>
          </div>
          {job && <JobStatus job={job} />}
          {warnings.map((w) => (
            <Notice key={w} kind="warn">
              {w}
            </Notice>
          ))}
          {pending && hasCues && (
            <Notice kind="warn">
              <strong>
                Transcription finished with {pending.cues.length} cues. Replace the {`current subtitles`}?
              </strong>
              <div>You can undo the replacement once it is done.</div>
              <div className="sub-actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    onApply(pending.cues);
                    setTx({ pending: null, summary: `Replaced the current subtitles with ${pending.cues.length} transcribed cues. Check every line.` });
                  }}
                >
                  Replace current subtitles
                </Button>
                <Button onClick={() => setTx({ pending: null, summary: 'Kept the current subtitles. The transcript was discarded.' })}>Keep current</Button>
              </div>
            </Notice>
          )}
          {(tx.timing || tx.summary) && (
            <p className="sub-muted" role="status">
              {[tx.timing, tx.summary].filter(Boolean).join(' ')}
            </p>
          )}
          <Notice>Automatic transcription makes mistakes, especially with names, accents, music and noise. Check every line.</Notice>
        </>
      )}
    </section>
  );
}
