import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import type { PageRef } from '@/engines/pdf/model';
import { openDoc } from './thumbs';
import type { RenderTask } from 'pdfjs-dist';

export const THUMB_WIDTH = 160;

/** Lazily rendered page preview. Renders only when scrolled near; cancels the render task on unmount. */
function Thumb({ srcId, blob, pageNo, rotation, label }: { srcId: string; blob: Blob | undefined; pageNo: number; rotation: number; label: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const el = holder.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !blob) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    (async () => {
      const doc = await openDoc(srcId, blob);
      if (cancelled) return;
      const page = await doc.getPage(pageNo);
      // An explicit rotation replaces the page's /Rotate, so combine them here.
      const rot = (page.rotate + rotation) % 360;
      const base = page.getViewport({ scale: 1, rotation: rot });
      const vp = page.getViewport({ scale: THUMB_WIDTH / base.width, rotation: rot });
      const el = canvas.current;
      const ctx = el?.getContext('2d');
      if (!el || !ctx || cancelled) return;
      el.width = Math.round(vp.width);
      el.height = Math.round(vp.height);
      task = page.render({ canvasContext: ctx, viewport: vp, canvas: el });
      await task.promise;
      if (!cancelled) setState('ready');
    })().catch(() => {
      if (!cancelled) setState('failed');
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, srcId, blob, pageNo, rotation]);

  return (
    <div ref={holder} className="pdf-thumb" data-state={state}>
      {state === 'failed' ? (
        <span className="pdf-thumb__fail">Preview unavailable</span>
      ) : (
        <canvas ref={canvas} aria-label={`Preview of ${label}`} role="img" className="pdf-thumb__canvas" />
      )}
    </div>
  );
}

export type TileData = { page: PageRef; pos: number; name: string; blob: Blob | undefined; selected: boolean };

export function PageTile({
  t,
  total,
  onToggle,
  onMove,
}: {
  t: TileData;
  total: number;
  onToggle: (key: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  const { page, pos } = t;
  return (
    <li className={`pdf-tile${t.selected ? ' pdf-tile--selected' : ''}`}>
      <div className="pdf-tile__top">
        <input type="checkbox" checked={t.selected} onChange={() => onToggle(page.key)} aria-label={`Select page ${pos}`} />
        <span className="pdf-tile__pos">Page {pos}</span>
      </div>
      <Thumb srcId={page.srcId} blob={t.blob} pageNo={page.srcIndex + 1} rotation={page.rotation} label={`page ${pos}`} />
      <p className="pdf-tile__source mono muted" title={`${t.name}, page ${page.srcIndex + 1}`}>
        {t.name} · p.{page.srcIndex + 1}
      </p>
      <div className="pdf-tile__move">
        <Button size="sm" variant="ghost" aria-label={`Move earlier, page ${pos}`} disabled={pos === 1} onClick={() => onMove(pos - 1, pos - 2)}>
          <ArrowLeft aria-hidden />
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Move later, page ${pos}`} disabled={pos === total} onClick={() => onMove(pos - 1, pos)}>
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </li>
  );
}
