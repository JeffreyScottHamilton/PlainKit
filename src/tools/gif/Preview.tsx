import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cropRect, outputSize } from '@/engines/gif/geometry';
import { renderInto } from '@/engines/gif/render';
import type { Crop, Entry, ProbeResult, ProbedFrame } from '@/engines/gif/types';
import { Button } from '@/components/ui';

const DISPLAY_MAX_W = 480;

type Props = { frames: Map<string, ProbedFrame>; plan: Entry[]; probe: ProbeResult; crop: Crop | null; width: number | null; loop: boolean };

/**
 * Plays the export plan on a canvas: same order, delays, speed, skip, crop and width as the file that will be written.
 * It runs at preview resolution; the exported GIF is at full resolution.
 */
export function Preview({ frames, plan, probe, crop, width, loop }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const i = Math.min(idx, Math.max(0, plan.length - 1));
  const cur = plan[i];
  const cr = cropRect(probe.width, probe.height, crop);
  const outFull = outputSize(cr.w, cr.h, width);
  const out = outputSize(cr.w, cr.h, Math.min(outFull.w, DISPLAY_MAX_W));

  useEffect(() => {
    const c = canvas.current;
    const f = cur ? frames.get(cur.id) : undefined;
    if (!c || !f) return;
    if (c.width !== out.w) c.width = out.w;
    if (c.height !== out.h) c.height = out.h;
    const ctx = c.getContext('2d');
    if (ctx) renderInto(ctx, f.bitmap, { w: probe.width, h: probe.height }, cr, out.w, out.h);
    // cr and out are derived from the props above; the frame id and size drive redraws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, frames, probe.width, probe.height, out.w, out.h, crop, width]);

  useEffect(() => {
    if (!playing || plan.length < 2) return;
    const t = window.setTimeout(() => {
      if (i + 1 < plan.length) setIdx(i + 1);
      else if (loop) setIdx(0);
      else setPlaying(false);
    }, plan[i]!.ms);
    return () => window.clearTimeout(t);
  }, [playing, i, plan, loop]);

  return (
    <section aria-labelledby="gif-prev-h" className="gif-section">
      <h2 id="gif-prev-h">Preview</h2>
      <div className="gif-preview">
        <canvas ref={canvas} className="gif-preview__canvas" role="img" aria-label={`Animation preview, frame ${i + 1} of ${plan.length}`} />
      </div>
      <div className="gif-preview__bar">
        {plan.length > 1 && (
          <Button size="sm" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />} {playing ? 'Pause preview' : 'Play preview'}
          </Button>
        )}
        <span className="mono muted">
          Frame {i + 1} of {plan.length}
          {cur ? ` · ${cur.ms} ms` : ''}
        </span>
      </div>
      <p className="muted gif-note">The preview is smaller than the file. The GIF uses full resolution.</p>
    </section>
  );
}
