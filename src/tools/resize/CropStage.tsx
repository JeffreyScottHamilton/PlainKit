import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { drawOriented } from '@/engines/resize/render';
import { fitCrop, KEY_STEP, moveNorm, orientedSize, resizeNorm } from '@/engines/resize/geometry';
import type { NormRect, Turns } from '@/engines/resize/types';

const PREVIEW_MAX = 1000;

type Props = {
  img: HTMLImageElement;
  name: string;
  turns: Turns;
  flipH: boolean;
  flipV: boolean;
  /** Crop as it is applied at this size (fractions of the oriented image). */
  crop: NormRect;
  aspect: number | null;
  onChange: (crop: NormRect) => void;
};

type Drag = { mode: 'move' | 'resize'; id: number; x: number; y: number; start: NormRect };

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Preview of the oriented image with a crop box. Pointer, touch and keyboard all move the same box. */
export function CropStage({ img, name, turns, flipH, flipV, crop, aspect, onChange }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  const o = orientedSize(w0, h0, turns);
  const scale = Math.min(1, PREVIEW_MAX / Math.max(o.width, o.height));
  const px = fitCrop(o.width, o.height, crop, aspect);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.width = Math.max(1, Math.round(o.width * scale));
    c.height = Math.max(1, Math.round(o.height * scale));
    drawOriented(ctx, img, w0, h0, { turns, flipH, flipV }, scale);
  }, [img, w0, h0, turns, flipH, flipV, o.width, o.height, scale]);

  const down = (mode: Drag['mode']) => (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, id: e.pointerId, x: e.clientX, y: e.clientY, start: crop };
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const box = frame.current?.getBoundingClientRect();
    if (!d || d.id !== e.pointerId || !box || box.width === 0 || box.height === 0) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    onChange(d.mode === 'move' ? moveNorm(d.start, dx, dy) : resizeNorm(d.start, dx, dy, o.width, o.height, aspect));
  };

  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  // Arrows move. Shift + arrows resize from the bottom-right corner (Right/Down grow, Left/Up shrink).
  // With a fixed ratio, the horizontal and vertical arrows both change the width and the height follows.
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    const [ax, ay] = dir;
    if (!e.shiftKey) return onChange(moveNorm(crop, ax * KEY_STEP, ay * KEY_STEP));
    if (aspect !== null) return onChange(resizeNorm(crop, (ax + ay) * KEY_STEP, 0, o.width, o.height, aspect));
    onChange(resizeNorm(crop, ax * KEY_STEP, ay * KEY_STEP, o.width, o.height, null));
  };

  return (
    <figure className="rs-stage">
      <div ref={frame} className="rs-frame" style={{ aspectRatio: `${o.width} / ${o.height}`, width: `min(100%, calc(min(56vh, 560px) * ${o.width} / ${o.height}))` }}>
        <canvas ref={canvas} className="rs-canvas" role="img" aria-label={`Preview of ${name}, ${o.width} × ${o.height} px after rotation`} />
        <div
          className="rs-crop"
          role="group"
          tabIndex={0}
          aria-label={`Crop area, ${px.w} × ${px.h} pixels. Arrow keys move it. Shift with an arrow key resizes it.`}
          style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
          onPointerDown={down('move')}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={key}
        >
          <span className="rs-handle" aria-hidden="true" onPointerDown={down('resize')} />
        </div>
      </div>
      <figcaption className="sr-only">{`Crop ${name}: ${px.w} × ${px.h} px`}</figcaption>
    </figure>
  );
}
