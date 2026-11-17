import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { renderInto } from '@/engines/gif/render';
import type { Entry, ProbedFrame } from '@/engines/gif/types';
import { GIF_LIMITS } from '@/engines/gif/types';
import { Button } from '@/components/ui';

const THUMB_H = 64;

function Thumb({ frame }: { frame: ProbedFrame }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(1, Math.round((frame.bitmap.width * THUMB_H) / frame.bitmap.height));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = w;
    c.height = THUMB_H;
    const ctx = c.getContext('2d');
    if (ctx) renderInto(ctx, frame.bitmap, { w: frame.bitmap.width, h: frame.bitmap.height }, { x: 0, y: 0, w: frame.bitmap.width, h: frame.bitmap.height }, w, THUMB_H);
  }, [frame, w]);
  return <canvas ref={ref} className="gif-frame__thumb" width={w} height={THUMB_H} aria-hidden="true" />;
}

/** Duration is committed on blur or Enter. The key remounts the field when the stored value changes. */
function Duration({ index, entry, onCommit }: { index: number; entry: Entry; onCommit: (ms: number) => void }) {
  return (
    <label className="gif-frame__ms">
      <span className="sr-only">Duration of frame {index + 1}, in milliseconds</span>
      <input
        key={`${entry.id}:${entry.ms}`}
        type="number"
        inputMode="numeric"
        min={GIF_LIMITS.minDelayMs}
        max={GIF_LIMITS.maxDelayMs}
        step={10}
        defaultValue={entry.ms}
        aria-label={`Duration of frame ${index + 1}, in milliseconds`}
        onBlur={(e) => {
          const v = Number(e.currentTarget.value);
          if (Number.isFinite(v) && v !== entry.ms) onCommit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <span className="mono muted">ms</span>
    </label>
  );
}

type Props = {
  entries: Entry[];
  frames: Map<string, ProbedFrame>;
  onMove: (from: number, to: number) => void;
  onRemove: (i: number) => void;
  onMs: (i: number, ms: number) => void;
};

/** Frames in play order. Buttons move and remove frames, so every action works without drag. */
export function FrameStrip({ entries, frames, onMove, onRemove, onMs }: Props) {
  const [over, setOver] = useState<number | null>(null);
  const from = useRef<number | null>(null);
  const n = entries.length;
  return (
    <ol className="gif-strip" aria-label={`${n} frames in play order`}>
      {entries.map((e, i) => {
        const f = frames.get(e.id);
        if (!f) return null;
        return (
          <li
            key={e.id}
            className={`gif-frame${over === i ? ' gif-frame--over' : ''}`}
            draggable
            onDragStart={() => (from.current = i)}
            onDragOver={(ev) => {
              ev.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(ev) => {
              ev.preventDefault();
              setOver(null);
              if (from.current !== null) onMove(from.current, i);
              from.current = null;
            }}
            onDragEnd={() => {
              setOver(null);
              from.current = null;
            }}
          >
            <Thumb frame={f} />
            <span className="gif-frame__no mono">{i + 1}</span>
            <div className="gif-frame__btns">
              <Button size="sm" className="gif-icon" aria-label={`Move frame ${i + 1} earlier`} disabled={i === 0} onClick={() => onMove(i, i - 1)}>
                <ChevronLeft aria-hidden />
              </Button>
              <Button size="sm" className="gif-icon" aria-label={`Move frame ${i + 1} later`} disabled={i === n - 1} onClick={() => onMove(i, i + 1)}>
                <ChevronRight aria-hidden />
              </Button>
              <Button size="sm" className="gif-icon" aria-label={`Remove frame ${i + 1}`} onClick={() => onRemove(i)}>
                <X aria-hidden />
              </Button>
            </div>
            <Duration index={i} entry={e} onCommit={(ms) => onMs(i, ms)} />
          </li>
        );
      })}
    </ol>
  );
}
