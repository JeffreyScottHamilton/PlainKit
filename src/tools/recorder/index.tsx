import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { AssetList } from '@/components/AssetList';
import { Button, Notice, Segmented } from '@/components/ui';
import { assetUrl } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { formatBytes } from '@/lib/format';
import { formatDuration } from '@/engines/recorder/duration';
import { currentEnv, modeSupport, type Mode } from '@/engines/recorder/support';
import { RecorderController, type Options, type Phase } from './controller';
import './recorder.css';

const MODES: { value: Mode; label: string }[] = [
  { value: 'screen', label: 'Screen' },
  { value: 'camera', label: 'Camera' },
  { value: 'voice', label: 'Voice memo' },
];

const PHASE_TEXT: Record<Phase, string> = {
  idle: 'Ready',
  starting: 'Waiting for permission',
  countdown: 'Starting',
  recording: 'Recording',
  paused: 'Paused',
  finishing: 'Saving',
  done: 'Saved',
  error: 'Stopped',
};

type Stored = Options & { mode: Mode };
const INITIAL: Stored = { mode: 'screen', mic: false, system: false, countdown: false };

export default function Tool() {
  // One controller per mount: leaving the page stops a recording and keeps what was captured.
  const [ctrl] = useState(() => new RecorderController());
  useEffect(() => () => ctrl.dispose(), [ctrl]);
  const s = useSyncExternalStore(ctrl.subscribe, ctrl.getState);
  const [cfg, setCfg] = useToolState<Stored>('recorder', INITIAL);
  const support = modeSupport(cfg.mode, currentEnv());

  const previewRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = previewRef.current;
    if (v && v.srcObject !== s.preview) v.srcObject = s.preview;
  }, [s.preview]);

  const idle = s.phase === 'idle' || s.phase === 'done' || s.phase === 'error';
  const live = s.phase === 'recording' || s.phase === 'paused';
  const opts: Options = {
    mic: cfg.mode === 'voice' || cfg.mic,
    system: cfg.mode === 'screen' && cfg.system,
    countdown: cfg.countdown,
  };

  const settings = (
    <div className="pk-stack rc-settings">
      <h2>Source</h2>
      <Segmented<Mode> label="Recording source" value={cfg.mode} options={MODES} onChange={(mode) => idle && setCfg({ mode })} />
      <h2>Options</h2>
      {cfg.mode !== 'voice' && (
        <label className="rc-check">
          <input type="checkbox" checked={cfg.mic} disabled={!idle} onChange={(e) => setCfg({ mic: e.target.checked })} />
          Include microphone
        </label>
      )}
      {cfg.mode === 'screen' && (
        <label className="rc-check">
          <input type="checkbox" checked={cfg.system} disabled={!idle} onChange={(e) => setCfg({ system: e.target.checked })} />
          Include system or tab audio
          <span className="rc-check-hint">Only if the browser offers it when you share.</span>
        </label>
      )}
      <label className="rc-check">
        <input type="checkbox" checked={cfg.countdown} disabled={!idle} onChange={(e) => setCfg({ countdown: e.target.checked })} />
        Count down 3, 2, 1 before recording
      </label>

      <div className="rc-actions">
        {idle && (
          <Button variant="primary" block disabled={!support.ok} onClick={() => ctrl.start(cfg.mode, opts)}>
            Start recording
          </Button>
        )}
        {s.phase === 'starting' && (
          <Button block disabled>
            Waiting for permission
          </Button>
        )}
        {s.phase === 'countdown' && (
          <Button block onClick={() => ctrl.cancel()}>
            Cancel countdown
          </Button>
        )}
        {live && (
          <>
            {s.phase === 'recording' ? (
              <Button disabled={!s.pauseSupported} onClick={() => ctrl.pause()}>
                Pause
              </Button>
            ) : (
              <Button onClick={() => ctrl.resume()}>Resume</Button>
            )}
            <Button variant="primary" onClick={() => ctrl.stop()}>
              Stop
            </Button>
          </>
        )}
        {s.phase === 'finishing' && (
          <Button block disabled>
            Saving
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <ToolPage toolId="recorder" settings={settings}>
      {!support.ok && <Notice kind="warn">{support.reason}</Notice>}
      {s.notice && <Notice kind="warn">{s.notice}</Notice>}
      {s.error && (
        <Notice kind="error">
          <strong>{s.error.message}</strong> {s.error.next}
        </Notice>
      )}

      <section className="rc-stage" aria-labelledby="rc-stage-h">
        <h2 id="rc-stage-h">Preview</h2>
        {s.preview ? (
          <video ref={previewRef} className="rc-video" autoPlay muted playsInline aria-label="Live preview" />
        ) : (
          <p className="rc-placeholder">{cfg.mode === 'voice' ? 'Voice memo has no picture. The level meter shows the microphone.' : 'No preview yet. Choose a source and start.'}</p>
        )}
        {s.phase === 'countdown' && <p className="rc-count" aria-hidden="true">{s.count}</p>}

        <dl className="rc-readout">
          <div>
            <dt>Status</dt>
            <dd className={live ? 'rc-live' : undefined}>{PHASE_TEXT[s.phase]}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd className="mono">{formatDuration(s.elapsedMs)}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd className="mono">
              {formatBytes(s.bytes)}
              {s.perMinute !== null && ` · about ${formatBytes(s.perMinute)} per minute`}
            </dd>
          </div>
        </dl>

        {s.micActive && (
          <div className="rc-mic">
            <span>Microphone level</span>
            <div className="rc-meter" aria-hidden="true" ref={(el) => ctrl.setMeter(el)}>
              <span className="rc-meter-fill" />
            </div>
          </div>
        )}
      </section>

      <p className="rc-hint" aria-live="polite">
        {s.announcement}
      </p>

      {s.result && (
        <section className="rc-result" aria-labelledby="rc-res-h">
          <h2 id="rc-res-h">Last recording</h2>
          {s.result.mime.startsWith('audio/') ? (
            <audio controls src={assetUrl(s.result)} aria-label={`Playback of ${s.result.name}`} />
          ) : (
            <video controls playsInline className="rc-video" src={assetUrl(s.result)} aria-label={`Playback of ${s.result.name}`} />
          )}
          <AssetList assets={[s.result]} />
        </section>
      )}

      <p className="rc-limits">Nothing is uploaded. The recording is kept in this tab until you clear the session.</p>
    </ToolPage>
  );
}
