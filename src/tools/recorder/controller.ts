// Recording controller. Owns the streams, the MediaRecorder and the audio graph. Plain class so the UI only
// reads state through subscribe(); every track is released on stop, cancel, error and dispose.
import { addGenerated } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { ToolError, isAbort } from '@/lib/errors';
import { estimatePerMinute } from '@/engines/recorder/duration';
import { peakLevel } from '@/engines/recorder/levels';
import { baseType, extensionFor, pickMime, type MediaKind } from '@/engines/recorder/mime';
import { recordingName, type RecordingKind } from '@/engines/recorder/naming';
import { currentEnv, modeSupport, type Mode } from '@/engines/recorder/support';

export type Options = { mic: boolean; system: boolean; countdown: boolean };
export type Phase = 'idle' | 'starting' | 'countdown' | 'recording' | 'paused' | 'finishing' | 'done' | 'error';

export type RecorderState = {
  phase: Phase;
  count: number;
  elapsedMs: number;
  bytes: number;
  perMinute: number | null;
  /** Live picture to show, or null when there is none (voice memo, or idle). */
  preview: MediaStream | null;
  micActive: boolean;
  pauseSupported: boolean;
  /** Something the user should know that is not a failure, such as system audio not offered. */
  notice: string | null;
  error: { message: string; next: string } | null;
  result: SessionAsset | null;
  /** Text for the polite status region. Changes on start, pause, resume, save and failures only. */
  announcement: string;
};

const INITIAL: RecorderState = {
  phase: 'idle',
  count: 0,
  elapsedMs: 0,
  bytes: 0,
  perMinute: null,
  preview: null,
  micActive: false,
  pauseSupported: true,
  notice: null,
  error: null,
  result: null,
  announcement: '',
};

const KIND: Record<Mode, RecordingKind> = { screen: 'screen', camera: 'camera', voice: 'voice' };
const subjectOf = (mode: Mode, opts: Options): string =>
  mode === 'screen' ? 'screen sharing' : mode === 'voice' ? 'the microphone' : opts.mic ? 'the camera or microphone' : 'the camera';

function describeFailure(e: unknown, subject: string): ToolError {
  const sentence = subject.charAt(0).toUpperCase() + subject.slice(1);
  const name = e instanceof Error ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new ToolError('permission', `Permission for ${subject} was denied.`, `Allow ${subject} in the browser's site settings or address bar, then press Start again.`);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new ToolError('not-found', `${sentence} was not found.`, 'Connect the device, or choose another mode.');
    case 'NotReadableError':
      return new ToolError('busy', `${sentence} cannot be read. Another app may be using it.`, 'Close the other app, then press Start again.');
    default:
      return new ToolError('failed', 'Recording could not start.', 'Try again. If it keeps failing, try another mode or browser.');
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type Acquired = { record: MediaStream; preview: MediaStream | null; notice: string | null; micOn: boolean };

export class RecorderController {
  private state: RecorderState = INITIAL;
  private listeners = new Set<() => void>();
  // Bumped whenever a start is abandoned, so a late permission prompt or countdown does nothing.
  private token = 0;
  private kind: RecordingKind = 'screen';
  private streams: MediaStream[] = [];
  private recordStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime: string | null = null;
  private bytes = 0;
  private accumMs = 0;
  private segStart = 0;
  private timer = 0;
  private audioCtx: AudioContext | null = null;
  private meterEl: HTMLElement | null = null;
  private meterFrame = 0;

  getState = (): RecorderState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** The mic level bar element. The level is written to it directly, so the page does not re-render per frame. */
  setMeter(el: HTMLElement | null): void {
    this.meterEl = el;
  }

  async start(mode: Mode, opts: Options): Promise<void> {
    if (!this.canStart()) return;
    if (!modeSupport(mode, currentEnv()).ok) return;
    const token = ++this.token;
    this.kind = KIND[mode];
    this.bytes = 0;
    this.accumMs = 0;
    this.chunks = [];
    this.set({ ...INITIAL, phase: 'starting', announcement: 'Waiting for permission.' });
    // Created here, inside the click, so the browser lets it start. Later awaits would lose that permission.
    if (mode === 'voice' || opts.mic || opts.system) this.ensureAudioContext();
    try {
      const got = await this.acquire(mode, opts);
      if (token !== this.token) {
        this.release();
        return;
      }
      this.set({
        phase: opts.countdown ? 'countdown' : 'starting',
        preview: got.preview,
        micActive: got.micOn,
        notice: got.notice,
        count: opts.countdown ? 3 : 0,
        announcement: opts.countdown ? 'Recording starts in 3 seconds.' : '',
      });
      if (opts.countdown) {
        for (let n = 3; n > 0; n--) {
          this.set({ count: n });
          await sleep(1000);
          if (token !== this.token) return;
        }
      }
      this.begin(got.record);
    } catch (e) {
      if (token !== this.token) return;
      this.release();
      if (isAbort(e)) {
        this.set({ ...INITIAL, notice: 'Recording was cancelled before it started.' });
      } else {
        const err = describeFailure(e, subjectOf(mode, opts));
        this.set({ phase: 'error', error: { message: err.message, next: err.nextAction ?? '' }, announcement: err.message });
      }
    }
  }

  cancel(): void {
    if (this.state.phase === 'countdown') this.abort('Countdown cancelled. Nothing was recorded.');
  }

  pause(): void {
    if (this.state.phase !== 'recording' || !this.recorder) return;
    this.accumMs = this.elapsed();
    this.recorder.pause();
    this.set({ phase: 'paused', announcement: 'Recording paused.' });
    this.tick();
  }

  resume(): void {
    if (this.state.phase !== 'paused' || !this.recorder) return;
    this.recorder.resume();
    this.segStart = Date.now();
    this.set({ phase: 'recording', announcement: 'Recording resumed.' });
    this.tick();
  }

  /** Stops and saves. The save happens in the recorder's stop event, after the last chunk arrives. */
  stop(): void {
    const p = this.state.phase;
    if ((p !== 'recording' && p !== 'paused') || !this.recorder) return;
    this.accumMs = this.elapsed();
    this.set({ phase: 'finishing', announcement: 'Saving the recording.' });
    if (this.recorder.state !== 'inactive') this.recorder.stop();
  }

  /** Called on unmount. A recording in progress is stopped and kept; anything else is released. */
  dispose(): void {
    this.token++;
    const p = this.state.phase;
    if ((p === 'recording' || p === 'paused') && this.recorder) {
      this.stop();
      return;
    }
    if (p !== 'finishing') this.release();
  }

  private canStart(): boolean {
    const p = this.state.phase;
    return p === 'idle' || p === 'done' || p === 'error';
  }

  private set(patch: Partial<RecorderState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private hold(s: MediaStream): MediaStream {
    this.streams.push(s);
    return s;
  }

  private async acquire(mode: Mode, opts: Options): Promise<Acquired> {
    const md = navigator.mediaDevices;
    let display: MediaStream | undefined;
    let camera: MediaStream | undefined;
    let mic: MediaStream | undefined;
    let notice: string | null = null;

    if (mode === 'screen') {
      display = this.hold(await md.getDisplayMedia({ video: true, audio: opts.system }));
      display.getVideoTracks()[0]?.addEventListener('ended', () => this.onShareEnded());
      if (opts.system && display.getAudioTracks().length === 0)
        notice = 'The browser did not offer system or tab audio, so this recording has no sound from the computer.';
      if (opts.mic) mic = this.hold(await md.getUserMedia({ audio: true }));
    } else if (mode === 'camera') {
      camera = this.hold(await md.getUserMedia({ video: true, audio: opts.mic }));
    } else {
      mic = this.hold(await md.getUserMedia({ audio: true }));
    }

    const sys = display?.getAudioTracks()[0];
    const micTrack = mic?.getAudioTracks()[0] ?? camera?.getAudioTracks()[0];
    let audio: MediaStreamTrack | undefined = sys ?? micTrack;
    const ctx = this.audioCtx;
    if (sys && micTrack && ctx) {
      // Both sources: mix into one track. Only one source: its track is used as it is.
      const dest = ctx.createMediaStreamDestination();
      for (const t of [sys, micTrack]) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest);
      audio = dest.stream.getAudioTracks()[0];
    }
    if (micTrack) this.startMeter(micTrack);

    const videos = [...(display?.getVideoTracks() ?? []), ...(camera?.getVideoTracks() ?? [])];
    this.recordStream = new MediaStream(audio ? [...videos, audio] : videos);
    return { record: this.recordStream, preview: display ?? camera ?? null, notice, micOn: !!micTrack };
  }

  private begin(record: MediaStream): void {
    const kind: MediaKind = this.kind === 'voice' ? 'audio' : 'video';
    const mime = pickMime(kind, (t) => MediaRecorder.isTypeSupported(t));
    const rec = mime ? new MediaRecorder(record, { mimeType: mime }) : new MediaRecorder(record);
    this.mime = mime;
    this.recorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
        this.bytes += e.data.size;
        this.tick();
      }
    };
    rec.onerror = () => this.onRecorderError();
    rec.onstop = () => this.finish();
    rec.start(1000);
    this.segStart = Date.now();
    this.timer = window.setInterval(() => this.tick(), 500);
    this.set({ phase: 'recording', count: 0, pauseSupported: typeof rec.pause === 'function', announcement: 'Recording started.' });
    this.tick();
  }

  private finish(): void {
    window.clearInterval(this.timer);
    const type = baseType(this.recorder?.mimeType || this.mime || (this.kind === 'voice' ? 'audio/webm' : 'video/webm'));
    const chunks = this.chunks;
    const size = this.bytes;
    const elapsed = this.accumMs;
    this.recorder = null;
    this.chunks = [];
    this.release();
    if (size === 0) {
      this.set({
        phase: 'error',
        elapsedMs: elapsed,
        error: { message: 'Nothing was recorded.', next: 'Check that the source is still sending, then try again.' },
        announcement: 'Nothing was recorded.',
      });
      return;
    }
    const asset = addGenerated({
      name: recordingName(this.kind, new Date(), extensionFor(type)),
      mime: type,
      blob: new Blob(chunks, { type }),
      parentIds: [],
    });
    this.set({ phase: 'done', result: asset, elapsedMs: elapsed, bytes: size, perMinute: null, announcement: `Saved ${asset.name} to this session.` });
  }

  private onRecorderError(): void {
    this.set({ notice: 'The recorder stopped with an error. What was captured before that is saved.' });
    this.stop();
  }

  private onShareEnded(): void {
    const p = this.state.phase;
    if (p === 'recording' || p === 'paused') this.stop();
    else if (p === 'countdown' || p === 'starting') this.abort('The screen share ended before recording started.');
  }

  private abort(notice: string): void {
    this.token++;
    this.release();
    this.set({ ...INITIAL, notice, announcement: notice });
  }

  private elapsed(): number {
    return this.accumMs + (this.state.phase === 'recording' ? Date.now() - this.segStart : 0);
  }

  private tick(): void {
    const ms = this.elapsed();
    this.set({ elapsedMs: ms, bytes: this.bytes, perMinute: estimatePerMinute(this.bytes, ms) });
  }

  private ensureAudioContext(): AudioContext | null {
    if (!this.audioCtx && typeof AudioContext !== 'undefined') this.audioCtx = new AudioContext();
    if (this.audioCtx) void this.audioCtx.resume().catch(() => undefined);
    return this.audioCtx;
  }

  private startMeter(track: MediaStreamTrack): void {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    // Analyser only: not connected to the destination, so the mic is never played back.
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const frame = () => {
      analyser.getFloatTimeDomainData(buf);
      this.meterEl?.style.setProperty('--level', peakLevel(buf).toFixed(3));
      this.meterFrame = requestAnimationFrame(frame);
    };
    this.meterFrame = requestAnimationFrame(frame);
  }

  /** Stops every track and the audio graph. Safe to call more than once. */
  private release(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    cancelAnimationFrame(this.meterFrame);
    this.meterFrame = 0;
    for (const s of this.streams) for (const t of s.getTracks()) t.stop();
    this.streams = [];
    if (this.recordStream) {
      for (const t of this.recordStream.getTracks()) t.stop();
      this.recordStream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    this.set({ preview: null, micActive: false });
  }
}
