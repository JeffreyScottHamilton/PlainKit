import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { Peaks } from '@/engines/audio/peaks';
import { formatTime } from '@/engines/audio-edit/dsp';

type Props = {
  peaks: Peaks;
  duration: number;
  startSec: number;
  endSec: number;
  onStart: (sec: number) => void;
  onEnd: (sec: number) => void;
  playheadRef: RefObject<HTMLDivElement | null>;
};

const pct = (sec: number, duration: number) => (duration > 0 ? (sec / duration) * 100 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Waveform with two draggable handles. Each handle is a slider: arrows step 0.1 s, Shift+arrows step 1 s. */
export function Waveform({ peaks, duration, startSec, endSec, onStart, onEnd, playheadRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const W = c.width;
    const H = c.height;
    const cols = peaks.min.length;
    const mid = H / 2;
    g.clearRect(0, 0, W, H);
    g.fillStyle = getComputedStyle(c).color;
    for (let x = 0; x < W; x++) {
      const i = Math.min(cols - 1, Math.floor((x * cols) / W));
      const top = mid - peaks.max[i]! * mid;
      const bottom = mid - peaks.min[i]! * mid;
      g.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
  }, [peaks]);

  const toSec = (clientX: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return r && r.width > 0 ? ((clientX - r.left) / r.width) * duration : 0;
  };

  const handle = (which: 'start' | 'end', sec: number) => {
    const onChange = which === 'start' ? onStart : onEnd;
    const min = which === 'start' ? 0 : startSec;
    const max = which === 'start' ? endSec : duration;
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 1 : 0.1;
      let d = 0;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step;
      else return;
      e.preventDefault();
      onChange(round1(Math.min(max, Math.max(min, sec + d))));
    };
    const onDrag = (e: PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(toSec(e.clientX));
    };
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={which === 'start' ? 'Selection start' : 'Selection end'}
        aria-valuemin={round1(min)}
        aria-valuemax={round1(max)}
        aria-valuenow={round1(sec)}
        aria-valuetext={`${formatTime(sec)}`}
        aria-orientation="horizontal"
        className={`ae-handle ae-handle--${which}`}
        style={{ left: `${pct(sec, duration)}%` }}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus();
        }}
        onPointerMove={onDrag}
      />
    );
  };

  return (
    <div ref={wrapRef} className="ae-wave">
      <canvas ref={canvasRef} className="ae-canvas" width={1200} height={320} aria-hidden="true" />
      <div className="ae-dim" style={{ left: 0, width: `${pct(startSec, duration)}%` }} />
      <div className="ae-dim" style={{ left: `${pct(endSec, duration)}%`, right: 0 }} />
      <div className="ae-sel" style={{ left: `${pct(startSec, duration)}%`, width: `${pct(endSec, duration) - pct(startSec, duration)}%` }} />
      <div ref={playheadRef} className="ae-playhead" hidden />
      {handle('start', startSec)}
      {handle('end', endSec)}
    </div>
  );
}
