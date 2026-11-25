import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, CopyButton, Field, Notice } from '@/components/ui';
import { ToolError } from '@/lib/errors';
import { useToolState } from '@/session/toolState';
import { cleanLine } from '@/engines/links/clean';
import { classify, type Classified, type Row, type UrlWarning } from '@/engines/qr/classify';
import { decodeRobust, pixelsFromBlob, pixelsFromSource } from '@/engines/qr/scan';

/** About five frames a second. */
const SCAN_INTERVAL_MS = 200;
const CAMERA_MAX_SIDE = 800;

const WARNING_TEXT: Record<UrlWarning, string> = {
  'ip-address': 'The host is an IP address, not a name. Check where this link goes before you open it.',
  punycode: 'The host uses punycode (xn--). Lookalike sites use it to imitate real names. Check the spelling.',
  shortener: 'This is a link shortener. The real destination is hidden until the link is followed.',
  username: 'The link contains a username or password. That can hide the real host.',
};
const SECURITY_TEXT = { WPA: 'WPA / WPA2 / WPA3', WEP: 'WEP', nopass: 'Open (no password)', unknown: 'Unknown' } as const;

type ScanStore = { text: string | null; source: string | null };
const INITIAL_SCAN: ScanStore = { text: null, source: null };

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was denied. Allow the camera for this site in your browser settings, or choose an image instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Choose an image instead.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close that app, or choose an image instead.';
  return 'The camera could not be started. Choose an image instead.';
}

/** Scan mode: read a code from an image, a pasted screenshot or the camera. Never opens what it finds. */
export function ScanMode() {
  const [st, set] = useToolState<ScanStore>('qr-code-scan', INITIAL_SCAN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [camStarting, setCamStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wantCamera = useRef(false);

  const stopCamera = useCallback(() => {
    wantCamera.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
    setCamStarting(false);
  }, []);

  // Leaving the page or hiding the tab releases the camera.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') stopCamera();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stopCamera);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stopCamera);
      stopCamera();
    };
  }, [stopCamera]);

  const readBlob = useCallback(
    async (blob: Blob, source: string) => {
      setBusy(true);
      setError(null);
      set({ text: null, source: null });
      try {
        const text = decodeRobust(await pixelsFromBlob(blob));
        if (text === null) setError('No QR code was found in this image. Try a sharper picture with the whole code in view, or a screenshot.');
        else set({ text, source });
      } catch (e) {
        setError(e instanceof ToolError ? `${e.message} ${e.nextAction ?? ''}`.trim() : 'This image could not be read.');
      } finally {
        setBusy(false);
      }
    },
    [set],
  );

  // Ctrl+V / Cmd+V with an image on the clipboard. Only while this mode is shown.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void readBlob(file, 'a pasted image');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [readBlob]);

  // Camera loop: one frame about every 200 ms until a code is found or the camera stops.
  useEffect(() => {
    const v = videoRef.current;
    const stream = streamRef.current;
    if (!camOn || !v || !stream) return;
    v.srcObject = stream;
    void v.play().catch(() => undefined);
    let inFlight = false;
    const timer = window.setInterval(() => {
      if (inFlight || v.readyState < 2 || v.videoWidth === 0) return;
      inFlight = true;
      try {
        const text = decodeRobust(pixelsFromSource(v, v.videoWidth, v.videoHeight, CAMERA_MAX_SIDE));
        if (text !== null) {
          stopCamera();
          set({ text, source: 'the camera' });
        }
      } catch {
        setError('The camera image could not be read. Choose an image instead.');
        stopCamera();
      } finally {
        inFlight = false;
      }
    }, SCAN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [camOn, set, stopCamera]);

  const startCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open a camera here. Choose an image or paste a screenshot instead.');
      return;
    }
    wantCamera.current = true;
    setCamStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!wantCamera.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCamStarting(false);
      setCamOn(true);
    } catch (e) {
      wantCamera.current = false;
      setCamStarting(false);
      setError(cameraError(e));
    }
  };

  return (
    <>
      <section className="qr-section" aria-labelledby="qr-scan-h">
        <h2 id="qr-scan-h">Scan a code</h2>
        <p className="qr-note">Reads a QR code from an image, a pasted screenshot or the camera. Nothing is uploaded, and a code is never opened for you.</p>
        <div
          className="qr-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void readBlob(f, f.name);
          }}
        >
          <Field label="Image file" hint="Drop an image here, paste one with Ctrl+V or Cmd+V, or choose a PNG, JPEG, WebP or GIF file.">
            {(a) => (
              <input
                {...a}
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readBlob(f, f.name);
                  e.target.value = '';
                }}
              />
            )}
          </Field>
          <div className="pk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {camOn || camStarting ? (
              <Button onClick={stopCamera}>Stop camera</Button>
            ) : (
              <Button disabled={busy} onClick={() => void startCamera()}>
                Use camera
              </Button>
            )}
          </div>
        </div>
        {camOn && <video ref={videoRef} className="qr-camera" playsInline muted aria-label="Camera view. Hold the code inside the frame." />}
        {busy && <p className="qr-note" role="status">Reading the image…</p>}
        {camStarting && <p className="qr-note" role="status">Starting the camera…</p>}
        {camOn && <p className="qr-note" role="status">Scanning. Hold the code steady inside the frame.</p>}
        {error && <Notice kind="error">{error}</Notice>}
      </section>

      {st.text !== null && (
        <section className="qr-section" aria-labelledby="qr-result-h">
          <h2 id="qr-result-h">Decoded content</h2>
          {st.source && <p className="qr-note">Read from {st.source}. Nothing has been opened.</p>}
          <ScanResult key={st.text} text={st.text} onAnother={() => set({ text: null, source: null })} />
        </section>
      )}
    </>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="qr-rows">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ScanResult({ text, onAnother }: { text: string; onAnother: () => void }) {
  const c = useMemo<Classified>(() => classify(text), [text]);
  const [showPw, setShowPw] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const cleaned = useMemo(() => (cleaning && c.kind === 'url' ? cleanLine(c.url, 1) : null), [cleaning, c]);

  return (
    <div className="qr-result">
      {c.kind === 'url' && (
        <>
          <p className="qr-text">
            {(() => {
              const i = text.toLowerCase().indexOf(c.host);
              if (i < 0) return c.url;
              return (
                <>
                  {text.slice(0, i)}
                  <strong className="qr-host">{text.slice(i, i + c.host.length)}</strong>
                  {text.slice(i + c.host.length)}
                </>
              );
            })()}
          </p>
          <p className="qr-note">Web link. It opens only when you choose to open it.</p>
          {c.warnings.map((w) => (
            <Notice key={w} kind="warn">
              {WARNING_TEXT[w]}
            </Notice>
          ))}
          <div className="pk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <a className="pk-btn" href={c.url} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </a>
            <Button onClick={() => setCleaning(true)}>Clean this link</Button>
          </div>
          {cleaned && cleaned.ok && (
            <div className="pk-stack" style={{ gap: 8 }}>
              <p className="qr-note">{cleaned.applied ? 'Tracking parameters removed:' : 'No tracking parameters found. The link is unchanged:'}</p>
              <p className="qr-text">{cleaned.cleaned}</p>
              <CopyButton text={cleaned.cleaned} label="Copy cleaned link" size="md" />
            </div>
          )}
          {cleaned && !cleaned.ok && <Notice kind="error">{cleaned.message}</Notice>}
        </>
      )}

      {c.kind === 'wifi' && (
        <>
          <dl className="qr-rows">
            <div>
              <dt>Network name</dt>
              <dd>{c.ssid}</dd>
            </div>
            <div>
              <dt>Security</dt>
              <dd>{SECURITY_TEXT[c.security]}</dd>
            </div>
            <div>
              <dt>Hidden network</dt>
              <dd>{c.hidden ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Password</dt>
              <dd>{c.password === '' ? 'None' : showPw ? c.password : '•'.repeat(Math.min(c.password.length, 12))}</dd>
            </div>
          </dl>
          {c.password !== '' && (
            <div className="pk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setShowPw((v) => !v)}>{showPw ? 'Hide password' : 'Show password'}</Button>
              <CopyButton text={c.password} label="Copy password" size="md" />
            </div>
          )}
        </>
      )}

      {c.kind === 'contact' && <Rows rows={c.rows} />}
      {c.kind === 'address' && (
        <>
          <Rows rows={c.rows} />
          <p className="qr-note">Shown for reference. Nothing is opened, sent or dialed.</p>
        </>
      )}
      {c.kind === 'text' && (
        <>
          <p className="qr-text">{c.text}</p>
          <p className="qr-note">Plain text. It is not a web link.</p>
        </>
      )}

      <div className="pk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <CopyButton text={text} label="Copy text" size="md" />
        <Button onClick={onAnother}>Scan another</Button>
      </div>
    </div>
  );
}
