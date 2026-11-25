import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { applyPatch, clampPoint, describeItem, itemFrame, type Patch } from '@/engines/sign-pdf/items';
import type { PageGeom } from '@/engines/sign-pdf/inspect';
import type { Item } from '@/engines/sign-pdf/types';
import { blobUrl } from './render';

const MIN_IMAGE_W = 12;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Props = {
  pdf: PDFDocumentProxy;
  index: number;
  geom: PageGeom;
  /** CSS pixels per display point. */
  pxPerPt: number;
  items: Item[];
  selected?: string;
  wrapRef: (el: HTMLElement | null) => void;
  onSelect: (id?: string) => void;
  onPatch: (id: string, p: Patch) => void;
  onDelete: (id: string) => void;
};

/** One page: a lazily rendered canvas with the placed items on top. */
export function PageView({ pdf, index, geom, pxPerPt, items, selected, wrapRef, onSelect, onPatch, onDelete }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const cssW = geom.width * pxPerPt;
  const cssH = geom.height * pxPerPt;

  useEffect(() => {
    const el = wrap.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    const el = canvas.current;
    if (!visible || !el) return;
    let alive = true;
    let task: RenderTask | undefined;
    const dpr = window.devicePixelRatio || 1;
    void (async () => {
      const page = await pdf.getPage(index + 1);
      if (!alive) return;
      const viewport = page.getViewport({ scale: pxPerPt * dpr });
      el.width = Math.ceil(viewport.width);
      el.height = Math.ceil(viewport.height);
      const ctx = el.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');
      task = page.render({ canvasContext: ctx, viewport, canvas: el });
      await task.promise;
    })().catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [pdf, index, visible, pxPerPt]);

  return (
    <section
      ref={(el) => {
        wrap.current = el;
        wrapRef(el);
      }}
      className="sp-page"
      aria-label={`Page ${index + 1}`}
      style={{ width: cssW, height: cssH }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || e.target === canvas.current) onSelect(undefined);
      }}
    >
      <canvas ref={canvas} className="sp-page__canvas" style={{ width: cssW, height: cssH }} aria-hidden />
      {failed && <p className="sp-page__fail">This page could not be drawn. Items can still be placed on it.</p>}
      {items
        .filter((it) => it.page === index)
        .map((it) => (
          <ItemBox key={it.id} it={it} geom={geom} pxPerPt={pxPerPt} selected={it.id === selected} onSelect={onSelect} onPatch={onPatch} onDelete={onDelete} />
        ))}
    </section>
  );
}

type BoxProps = {
  it: Item;
  geom: PageGeom;
  pxPerPt: number;
  selected: boolean;
  onSelect: (id?: string) => void;
  onPatch: (id: string, p: Patch) => void;
  onDelete: (id: string) => void;
};

/** A placed item: drag to move, corner handle to resize, arrows to nudge, Delete to remove. */
function ItemBox({ it, geom, pxPerPt, selected, onSelect, onPatch, onDelete }: BoxProps) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; x: number; y: number; ox: number; oy: number; size: number } | null>(null);
  const sized = it.kind !== 'text' && it.kind !== 'date';
  const frame = itemFrame(it);
  const base = it.kind === 'image' ? it.w : it.size;

  /** Patch that sets the item's main dimension (width for images, size for text and marks), kept on the page. */
  const sizePatch = (target: number): Patch => {
    const change: Patch = it.kind === 'image' ? { w: clamp(target, MIN_IMAGE_W, geom.width - it.x) } : { size: clamp(target, 6, 200) };
    const p = clampPoint(applyPatch(it, change), geom.width, geom.height, it.x, it.y);
    return { ...change, x: p.x, y: p.y };
  };

  const start = (e: PointerEvent<HTMLElement>, mode: 'move' | 'resize') => {
    e.stopPropagation();
    onSelect(it.id);
    box.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, ox: it.x, oy: it.y, size: base };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / pxPerPt;
    const dy = (e.clientY - d.y) / pxPerPt;
    if (d.mode === 'move') onPatch(it.id, clampPoint(it, geom.width, geom.height, d.ox + dx, d.oy + dy));
    else onPatch(it.id, sizePatch(d.size + dx));
  };
  const end = () => {
    drag.current = null;
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = dirs[e.key];
    if (d) {
      e.preventDefault();
      onPatch(it.id, clampPoint(it, geom.width, geom.height, it.x + d[0], it.y + d[1]));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(it.id);
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      onPatch(it.id, sizePatch(base * (e.key === '-' ? 1 / 1.1 : 1.1)));
    } else if (e.key === 'Escape') {
      onSelect(undefined);
    }
  };

  const style: CSSProperties = {
    left: it.x * pxPerPt,
    top: it.y * pxPerPt,
    ...(sized ? { width: frame.w * pxPerPt, height: frame.h * pxPerPt } : {}),
  };

  let body;
  if (it.kind === 'image') {
    body = <img src={blobUrl(it.blob)} alt="" draggable={false} className="sp-item__img" />;
  } else if (it.kind === 'text' || it.kind === 'date') {
    body = (
      <span className="sp-item__text" style={{ fontSize: it.size * pxPerPt }}>
        {it.text}
      </span>
    );
  } else {
    body = (
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="sp-item__mark" aria-hidden focusable="false">
        {it.kind === 'check' ? (
          <polyline points="0.12,0.55 0.4,0.82 0.88,0.18" />
        ) : (
          <>
            <line x1="0.15" y1="0.15" x2="0.85" y2="0.85" />
            <line x1="0.85" y1="0.15" x2="0.15" y2="0.85" />
          </>
        )}
      </svg>
    );
  }

  return (
    <div
      ref={box}
      role="button"
      tabIndex={0}
      aria-label={describeItem(it)}
      aria-pressed={selected}
      className={`sp-item${selected ? ' sp-item--sel' : ''}`}
      style={style}
      onPointerDown={(e) => start(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKey}
      onFocus={() => onSelect(it.id)}
    >
      {body}
      {selected && <span className="sp-handle" aria-hidden onPointerDown={(e) => start(e, 'resize')} />}
    </div>
  );
}
