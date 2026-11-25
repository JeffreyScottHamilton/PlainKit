import { useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import { Undo2 } from 'lucide-react';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { imageFileToMark, strokesToMark, typedMark, type Pt } from '@/engines/sign-pdf/marks';
import type { Mark } from '@/engines/sign-pdf/types';
import { toToolError } from '@/lib/errors';

export type MarkLabel = 'Signature' | 'Initials';
type Mode = 'draw' | 'type' | 'upload';
const MODES: { value: Mode; label: string }[] = [
  { value: 'draw', label: 'Draw' },
  { value: 'type', label: 'Type' },
  { value: 'upload', label: 'Upload' },
];

/** Draws the strokes as smooth curves. Coordinates are CSS pixels of the pad. */
function paint(c: HTMLCanvasElement, strokes: Pt[][]) {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#111';
  ctx.fillStyle = '#111';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    const p0 = s[0];
    if (!p0) continue;
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, 1.25, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < s.length - 1; i++) {
      const a = s[i]!;
      const b = s[i + 1]!;
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    const last = s[s.length - 1]!;
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

function DrawPad({ strokes, setStrokes }: { strokes: Pt[][]; setStrokes: Dispatch<SetStateAction<Pt[][]>> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const down = useRef(false);

  useEffect(() => {
    if (canvas.current) paint(canvas.current, strokes);
  }, [strokes]);

  const at = (e: PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <canvas
      ref={canvas}
      className="sp-pad"
      role="img"
      aria-label="Signature pad. Draw with a mouse or finger, or use Type or Upload instead."
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        down.current = true;
        const p = at(e);
        setStrokes((s) => [...s, [p]]);
      }}
      onPointerMove={(e) => {
        if (!down.current) return;
        const p = at(e);
        setStrokes((s) => {
          const last = s[s.length - 1];
          return last ? [...s.slice(0, -1), [...last, p]] : s;
        });
      }}
      onPointerUp={() => {
        down.current = false;
      }}
      onPointerCancel={() => {
        down.current = false;
      }}
    />
  );
}

/** Makes a signature or initials from a drawing, a typed name, or an uploaded image. Each mark is saved by the parent. */
export function SignaturePanel({ onSaved }: { onSaved: (label: MarkLabel, mark: Mark) => void }) {
  const [mode, setMode] = useState<Mode>('draw');
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [typed, setTyped] = useState('');
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const save = async (label: MarkLabel, make: () => Promise<Mark>) => {
    setError(undefined);
    setBusy(true);
    try {
      onSaved(label, await make());
    } catch (e) {
      const err = toToolError(e);
      setError(err.nextAction ? `${err.message} ${err.nextAction}` : err.message);
    } finally {
      setBusy(false);
    }
  };

  const typedName = typed.trim();
  const saveButtons = (make: (label: MarkLabel) => Promise<Mark>, disabled: boolean) => (
    <div className="sp-row">
      <Button size="sm" variant="primary" disabled={disabled || busy} onClick={() => save('Signature', () => make('Signature'))}>
        Save as signature
      </Button>
      <Button size="sm" disabled={disabled || busy} onClick={() => save('Initials', () => make('Initials'))}>
        Save as initials
      </Button>
    </div>
  );

  return (
    <section aria-labelledby="sp-sign-h" className="sp-block">
      <h3 id="sp-sign-h">Create a signature</h3>
      <Segmented label="Signature method" value={mode} options={MODES} onChange={setMode} />

      {mode === 'draw' && (
        <>
          <DrawPad strokes={strokes} setStrokes={setStrokes} />
          <div className="sp-row">
            <Button size="sm" disabled={!strokes.length} onClick={() => setStrokes((s) => s.slice(0, -1))}>
              <Undo2 aria-hidden /> Undo stroke
            </Button>
            <Button size="sm" disabled={!strokes.length} onClick={() => setStrokes([])}>
              Clear
            </Button>
          </div>
          {saveButtons(() => strokesToMark(strokes), !strokes.length)}
        </>
      )}

      {mode === 'type' && (
        <>
          <Field label="Name to type" hint="Shown in a script-style font. This is a typed name, not handwriting.">
            {(p) => <input {...p} type="text" className="pk-input" value={typed} onChange={(e) => setTyped(e.target.value)} />}
          </Field>
          {saveButtons(() => typedMark(typedName), !typedName)}
        </>
      )}

      {mode === 'upload' && (
        <>
          <Field label="Image file" hint="PNG or JPEG. Its white background becomes transparent.">
            {(p) => <input {...p} type="file" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0])} />}
          </Field>
          {saveButtons(() => imageFileToMark(file!), !file)}
        </>
      )}

      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}
