import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Pt, Quad } from '@/engines/scan/types';

const NAMES = ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'] as const;
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const STEP = 0.005;
const BIG_STEP = 0.02;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

type Props = { src: string; name: string; quad: Quad; onCommit: (q: Quad) => void };

/** The photo with four draggable corner handles. Pointer drags move live and commit on release; arrow keys nudge and commit each step. */
export function CornerStage({ src, name, quad, onCommit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; id: number } | null>(null);
  const latest = useRef<Quad>(quad);
  const [draft, setDraft] = useState<Quad | null>(null);
  const shown = draft ?? quad;

  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const down = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { i, id: e.pointerId };
    latest.current = quad;
  };

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const next = [...latest.current] as [Pt, Pt, Pt, Pt];
    next[d.i] = at(e);
    latest.current = next;
    setDraft(next);
  };

  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDraft(null);
    onCommit(latest.current);
  };

  const key = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    const s = e.shiftKey ? BIG_STEP : STEP;
    const next = [...quad] as [Pt, Pt, Pt, Pt];
    next[i] = { x: clamp(quad[i]!.x + dir[0] * s), y: clamp(quad[i]!.y + dir[1] * s) };
    onCommit(next);
  };

  return (
    <div className="scan-stage" role="group" aria-label={`Corners of ${name}. Drag the handles or focus one and use the arrow keys.`}>
      <div className="scan-stage__frame" ref={box}>
        <img src={src} alt="" draggable={false} className="scan-stage__img" />
        <svg className="scan-outline" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <polygon points={shown.map((p) => `${p.x},${p.y}`).join(' ')} />
        </svg>
        {NAMES.map((label, i) => (
          <button
            key={label}
            type="button"
            className="scan-handle"
            aria-label={label}
            title={`${label}: ${pct(shown[i]!.x)} across, ${pct(shown[i]!.y)} down`}
            style={{ left: pct(shown[i]!.x), top: pct(shown[i]!.y) }}
            onPointerDown={down(i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={key(i)}
          />
        ))}
      </div>
    </div>
  );
}
