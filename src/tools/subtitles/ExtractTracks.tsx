import { useRef, useState } from 'react';
import { Button, Notice, Progress } from '@/components/ui';
import type { Cue } from '@/engines/subtitles/model';
import { readMkvSubtitles, type MkvSubtitles } from '@/engines/subtitles/mkv';
import { toToolError } from '@/lib/errors';
import { formatBytes } from '@/lib/format';

type State =
  | { phase: 'idle' }
  | { phase: 'reading'; name: string; fraction: number }
  | { phase: 'done'; name: string; size: number; result: MkvSubtitles }
  | { phase: 'error'; message: string; next?: string };

/** Reads text subtitle tracks that are stored inside an MKV or WebM file and hands one to the editor. */
export function ExtractTracks({ hasCues, onApply }: { hasCues: boolean; onApply: (cues: Cue[]) => void }) {
  const [st, setSt] = useState<State>({ phase: 'idle' });
  const [confirm, setConfirm] = useState<number | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const pick = () => {
    // Created on demand so the page keeps a single file input for the subtitle file itself.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mkv,.webm,.mka,video/x-matroska,video/webm';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void read(f);
    };
    input.click();
  };

  const read = async (f: File) => {
    ctl.current?.abort();
    const c = (ctl.current = new AbortController());
    setConfirm(null);
    setSt({ phase: 'reading', name: f.name, fraction: 0 });
    try {
      let last = 0;
      const result = await readMkvSubtitles(f, {
        signal: c.signal,
        onProgress: (fraction) => {
          if (fraction - last > 0.02 || fraction === 1) {
            last = fraction;
            setSt({ phase: 'reading', name: f.name, fraction });
          }
        },
      });
      setSt({ phase: 'done', name: f.name, size: f.size, result });
    } catch (e) {
      if (c.signal.aborted) return setSt({ phase: 'idle' });
      const t = toToolError(e);
      setSt({ phase: 'error', message: t.message, next: t.nextAction });
    }
  };

  const load = (n: number) => {
    if (st.phase !== 'done') return;
    onApply(st.result.cues.get(n) ?? []);
    setConfirm(null);
  };

  return (
    <section className="sub-section" aria-labelledby="sub-extract-h">
      <h2 id="sub-extract-h">Read subtitles stored in a video</h2>
      <p className="sub-muted">
        Works for text subtitle tracks inside MKV and WebM files. Not for MP4 or MOV, not for picture-based subtitles (PGS, VobSub), and not for subtitles that are part of the picture. The file is read on this device.
      </p>
      <div className="pk-row">
        <Button onClick={pick} disabled={st.phase === 'reading'}>
          Choose an MKV or WebM file
        </Button>
        {st.phase === 'reading' && (
          <Button size="sm" onClick={() => ctl.current?.abort()}>
            Cancel
          </Button>
        )}
      </div>
      {st.phase === 'reading' && (
        <div className="pk-stack" style={{ gap: 4 }}>
          <span>
            Scanning {st.name} · {Math.round(st.fraction * 100)}%
          </span>
          <Progress fraction={st.fraction} label="Scanning the file for subtitle tracks" />
        </div>
      )}
      {st.phase === 'error' && (
        <Notice kind="error">
          <strong>{st.message}</strong>
          {st.next ? <div>{st.next}</div> : null}
        </Notice>
      )}
      {st.phase === 'done' && (
        <>
          <p className="sub-muted">
            {st.name} · {formatBytes(st.size)} · {st.result.tracks.length === 0 ? 'No subtitle tracks found in this file.' : `${st.result.tracks.length} subtitle ${st.result.tracks.length === 1 ? 'track' : 'tracks'}`}
          </p>
          <ul className="pk-assets" aria-label="Subtitle tracks">
            {st.result.tracks.map((t) => {
              const count = st.result.cues.get(t.number)?.length ?? 0;
              const label = `Track ${t.number}${t.name ? ` “${t.name}”` : ''} · ${t.language} · ${t.codec}`;
              return (
                <li key={t.number} className="pk-asset">
                  <div className="pk-asset__meta">
                    <div className="pk-asset__name">{label}</div>
                    <div className="mono muted">{t.text ? `${count} ${count === 1 ? 'cue' : 'cues'}` : 'Picture-based or unknown format: cannot be read as text'}</div>
                  </div>
                  {t.text && count > 0 && (
                    <Button size="sm" onClick={() => (hasCues ? setConfirm(t.number) : load(t.number))} aria-label={`Load track ${t.number} into the editor`}>
                      Load into editor
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {confirm !== null && (
            <Notice kind="warn">
              <div>Loading track {confirm} replaces the subtitles in the editor. You can undo it.</div>
              <div className="pk-row" style={{ marginTop: 8 }}>
                <Button size="sm" onClick={() => load(confirm)}>
                  Replace current subtitles
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Keep current
                </Button>
              </div>
            </Notice>
          )}
        </>
      )}
    </section>
  );
}
