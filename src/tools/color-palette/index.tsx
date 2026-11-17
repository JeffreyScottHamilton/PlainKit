import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow, downloadAsset } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, CopyButton, Field, Notice, Progress, Segmented } from '@/components/ui';
import { setInputs, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { toToolError, ToolError } from '@/lib/errors';
import { outputName, uid } from '@/lib/format';
import { analyzeImage } from '@/engines/palette/client';
import { FORMAT_LABEL, formatColor, parseColor, rgbToHex, type ColorFormat } from '@/engines/palette/color';
import { cssVariables, hexList } from '@/engines/palette/export';
import { renderPalettePng, type PngRow } from '@/engines/palette/render';
import { PALETTE_SIZES, type PaletteSize, type Rgba, type Swatch } from '@/engines/palette/types';
import './color-palette.css';

const TOOL = 'color-palette';
const MAX_COLORS = 20;
/** Registry lists the common formats; HEIC and TIFF join through the extension, as the image tools do. */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.heic,.heif,.tif,.tiff';

type Entry = { id: string; hex: string; share?: number };
type Stored = { size: PaletteSize; format: ColorFormat; palettes: Record<string, Entry[]> };
const INITIAL: Stored = { size: 5, format: 'hex', palettes: {} };

const toEntry = (s: Swatch): Entry => ({ id: uid(), hex: s.hex, share: s.share });
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

export default function Tool() {
  const inputs = useToolInputs(TOOL);
  const input = inputs[inputs.length - 1];
  const [st, set] = useToolState<Stored>(TOOL, INITIAL);
  const jobs = useJobs(TOOL);
  const [shown, setShown] = useState<{ id: string; img: Rgba } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ToolError | null>(null);
  const [note, setNote] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [pngJobId, setPngJobId] = useState<string | null>(null);
  const [addHex, setAddHex] = useState('#3a3e42');
  const [addError, setAddError] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const list = (input && st.palettes[input.id]) || [];
  const preview = input && shown?.id === input.id ? shown.img : undefined;
  const hexes = list.map((e) => e.hex);
  const pngJob = jobs.find((j) => j.id === pngJobId);
  const pngOut = pngJob?.state === 'complete' ? pngJob.result?.assets[0] : undefined;

  const setList = (id: string, next: (l: Entry[]) => Entry[]) =>
    set((s) => ({ ...s, palettes: { ...s.palettes, [id]: next(s.palettes[id] ?? []) } }));

  const analyze = (asset: SessionAsset, k: PaletteSize, replace: boolean) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setError(null);
    analyzeImage(asset.blob, k, c.signal)
      .then((res) => {
        if (c.signal.aborted) return;
        setShown({ id: asset.id, img: res.preview });
        if (replace) {
          setList(asset.id, () => res.colors.map(toEntry));
          setNote(`Found ${res.colors.length} ${res.colors.length === 1 ? 'color' : 'colors'}.`);
        }
        setBusy(false);
      })
      .catch((e: unknown) => {
        if (c.signal.aborted) return;
        setError(toToolError(e));
        setBusy(false);
      });
  };

  // Each new picture: keep its saved palette if it has one, and always read pixels for picking.
  useEffect(() => {
    if (input) analyze(input, st.size, !st.palettes[input.id]);
    // Size changes are handled by changeSize, so only a new picture triggers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input?.id]);
  useEffect(() => {
    return () => {
      ctl.current?.abort();
      window.clearTimeout(copyTimer.current);
    };
  }, []);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !preview) return;
    c.width = preview.width;
    c.height = preview.height;
    c.getContext('2d')?.putImageData(new ImageData(preview.data, preview.width, preview.height), 0, 0);
  }, [preview]);

  const changeSize = (size: PaletteSize) => {
    set({ size });
    if (input) analyze(input, size, true);
  };

  const addColor = (hex: string): string | null => {
    if (!input) return null;
    if (list.some((e) => e.hex === hex)) return `${hex} is already in the palette.`;
    if (list.length >= MAX_COLORS) return `The palette holds up to ${MAX_COLORS} colors. Remove one first.`;
    setList(input.id, (l) => [...l, { id: uid(), hex }]);
    return null;
  };

  const pick = (e: MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    if (!preview) return;
    // Map the click through object-fit: the picture may be letterboxed inside the element.
    const r = c.getBoundingClientRect();
    const s = Math.min(r.width / c.width, r.height / c.height);
    const x = Math.floor((e.clientX - r.left - (r.width - c.width * s) / 2) / s);
    const y = Math.floor((e.clientY - r.top - (r.height - c.height * s) / 2) / s);
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return setNote('Click inside the picture to pick a color.');
    const i = (y * c.width + x) * 4;
    if ((preview.data[i + 3] ?? 0) < 128) return setNote('That pixel is transparent. Pick another spot.');
    const hex = rgbToHex({ r: preview.data[i] ?? 0, g: preview.data[i + 1] ?? 0, b: preview.data[i + 2] ?? 0 });
    setNote(addColor(hex) ?? `Added ${hex}.`);
  };

  const copy = async (e: Entry) => {
    try {
      await navigator.clipboard.writeText(e.hex);
      setCopiedId(e.id);
      setNote(`Copied ${e.hex}.`);
    } catch {
      setCopiedId(null);
      setNote(`Copy failed. Select ${e.hex} and copy it.`);
    }
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedId(null), 1500);
  };

  const saveEdit = (id: string, hex: string): string | null => {
    if (!input) return null;
    if (list.some((e) => e.id !== id && e.hex === hex)) return `${hex} is already in the palette.`;
    setList(input.id, (l) => l.map((e) => (e.id === id ? { id, hex } : e)));
    setEditId(null);
    setNote(`Changed to ${hex}.`);
    return null;
  };

  const removeEntry = (id: string) => {
    if (!input) return;
    setList(input.id, (l) => l.filter((e) => e.id !== id));
    if (editId === id) setEditId(null);
  };

  const exportPng = () => {
    if (!input || !list.length) return;
    const { format } = st;
    const rows: PngRow[] = list.map((e) => ({
      hex: e.hex,
      primary: formatColor(e.hex, format),
      secondary: e.share === undefined ? e.hex : `${e.hex} · ${percent(e.share)}`,
    }));
    const a = input;
    setPngJobId(
      enqueue({
        toolId: TOOL,
        label: `Export palette for ${a.name}`,
        inputIds: [a.id],
        run: async () => ({ outputs: [{ name: outputName(a.name, 'palette', 'png'), mime: 'image/png', blob: await renderPalettePng(rows) }] }),
      }),
    );
  };

  const css = cssVariables(hexes);
  const txt = hexList(hexes);
  const saveText = (ext: string, text: string, type: string) => {
    if (!input) return;
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = outputName(input.name, 'palette', ext);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <ToolPage
      toolId={TOOL}
      settings={
        <div className="cp-settings pk-stack">
          <h2>Colors</h2>
          <Segmented
            label="Number of colors"
            value={String(st.size)}
            options={PALETTE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => changeSize(Number(v) as PaletteSize)}
          />
          <Button disabled={!input || busy} onClick={() => input && analyze(input, st.size, true)}>
            Re-extract from picture
          </Button>
          <p className="cp-hint">Re-extracting replaces the list, including your edits.</p>

          <Segmented<ColorFormat>
            label="Show colors as"
            value={st.format}
            options={(Object.keys(FORMAT_LABEL) as ColorFormat[]).map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
            onChange={(format) => set({ format })}
          />

          <h2>Add a color</h2>
          <Field label="Color" error={addError || undefined}>
            {(p) => (
              <div className="cp-addrow">
                <input
                  {...p}
                  type="color"
                  className="cp-color"
                  value={addHex}
                  onChange={(e) => {
                    setAddHex(e.target.value);
                    setAddError('');
                  }}
                />
                <Button
                  onClick={() => {
                    if (!input) return;
                    const err = addColor(addHex);
                    setAddError(err ?? '');
                    if (!err) setNote(`Added ${addHex}.`);
                  }}
                  disabled={!input}
                >
                  Add
                </Button>
              </div>
            )}
          </Field>

          <h2>Export</h2>
          <div className="cp-exports">
            <Button variant="primary" disabled={!input || !list.length || (!!pngJob && isActive(pngJob))} onClick={exportPng}>
              Export PNG
            </Button>
            {pngJob && pngJob.state !== 'complete' && <JobStatus job={pngJob} />}
            {pngOut && (
              <ul className="pk-assets">
                <AssetRow asset={pngOut} exclude={TOOL} />
              </ul>
            )}
            {pngOut && <Button onClick={() => downloadAsset(pngOut)}>Download PNG</Button>}
            <CopyButton text={list.length ? css : ''} label="Copy CSS variables" size="md" />
            <Button disabled={!list.length} onClick={() => saveText('css', css, 'text/css')}>
              Download .css
            </Button>
            <CopyButton text={list.length ? txt : ''} label="Copy HEX list" size="md" />
            <Button disabled={!list.length} onClick={() => saveText('txt', txt, 'text/plain')}>
              Download .txt
            </Button>
          </div>
        </div>
      }
    >
      <div className="cp-main pk-stack">
        {!input ? (
          <DropZone toolId={TOOL} multiple={false} accept={ACCEPT} hint="Your image stays on this device. HEIC and TIFF files work too." />
        ) : (
          <>
            <p className="cp-name" title={input.name}>
              <span>{input.name}</span>
            </p>
            {busy && <Progress label="Reading colors" />}
            {error && (
              <Notice kind="error">
                <strong>{error.message}</strong>
                {error.nextAction && <div>{error.nextAction}</div>}
              </Notice>
            )}
            {preview && (
              <div className="cp-preview">
                <canvas ref={canvasRef} className="cp-canvas" role="img" aria-label={`Picture: ${input.name}. Click a spot to add its color.`} onClick={pick} />
              </div>
            )}
            <p className="cp-hint">Click the picture to add the color under the cursor.</p>
            <p className="cp-note" role="status">
              {note}
            </p>

            <section aria-labelledby="cp-palette" className="cp-section">
              <div className="cp-heading">
                <h2 id="cp-palette">Palette</h2>
                <span className="muted">{list.length} of {MAX_COLORS} max</span>
              </div>
              {list.length === 0 ? (
                <p className="muted">No colors yet. Re-extract from the picture, click the picture, or add a color in the settings.</p>
              ) : (
                <ul className="cp-list">
                  {list.map((e) => (
                    <SwatchRow
                      key={e.id}
                      entry={e}
                      format={st.format}
                      copied={copiedId === e.id}
                      editing={editId === e.id}
                      onCopy={copy}
                      onToggleEdit={() => setEditId(editId === e.id ? null : e.id)}
                      onRemove={removeEntry}
                      onSave={saveEdit}
                      onCancel={() => setEditId(null)}
                    />
                  ))}
                </ul>
              )}
            </section>

            <DropZone
              toolId={TOOL}
              compact
              multiple={false}
              accept={ACCEPT}
              hint="Choose another picture to replace this one."
              onAdded={(added) => added[0] && setInputs(TOOL, [added[0].id])}
            />
          </>
        )}
      </div>
    </ToolPage>
  );
}

type RowProps = {
  entry: Entry;
  format: ColorFormat;
  copied: boolean;
  editing: boolean;
  onCopy: (e: Entry) => void;
  onToggleEdit: () => void;
  onRemove: (id: string) => void;
  onSave: (id: string, hex: string) => string | null;
  onCancel: () => void;
};

function SwatchRow({ entry, format, copied, editing, onCopy, onToggleEdit, onRemove, onSave, onCancel }: RowProps) {
  return (
    <li className="cp-item">
      <button type="button" className="cp-swatch" style={{ background: entry.hex }} aria-label={`Copy ${entry.hex}`} onClick={() => onCopy(entry)} />
      <div className="cp-text">
        <span className="cp-value">{formatColor(entry.hex, format)}</span>
        <span className="cp-meta">
          {entry.share === undefined ? 'Added by hand' : `${percent(entry.share)} of picture`}
          {copied ? ' · Copied' : ''}
        </span>
      </div>
      <div className="cp-actions">
        <Button size="sm" aria-expanded={editing} aria-label={`Edit ${entry.hex}`} onClick={onToggleEdit}>
          Edit
        </Button>
        <Button size="sm" aria-label={`Remove ${entry.hex}`} onClick={() => onRemove(entry.id)}>
          Remove
        </Button>
      </div>
      {editing && <Editor key={entry.id} entry={entry} format={format} onSave={onSave} onCancel={onCancel} />}
    </li>
  );
}

function Editor({ entry, format, onSave, onCancel }: { entry: Entry; format: ColorFormat; onSave: (id: string, hex: string) => string | null; onCancel: () => void }) {
  const initial = formatColor(entry.hex, format);
  const [draft, setDraft] = useState(initial);
  const [err, setErr] = useState('');
  const parsed = parseColor(draft);
  const pickerValue = parsed.ok ? rgbToHex(parsed.rgb) : entry.hex;

  const save = () => {
    // Untouched text keeps the exact stored color: HSL text is rounded for display.
    if (draft === initial) return onCancel();
    const p = parseColor(draft);
    if (!p.ok) return setErr(p.error);
    const e = onSave(entry.id, rgbToHex(p.rgb));
    if (e) setErr(e);
  };

  return (
    <div className="cp-editor">
      <Field label="Pick a color">
        {(p) => (
          <input
            {...p}
            type="color"
            className="cp-color"
            value={pickerValue}
            onChange={(e) => {
              setDraft(formatColor(e.target.value, format));
              setErr('');
            }}
          />
        )}
      </Field>
      <Field label="HEX, RGB or HSL" error={err || undefined} hint="Examples: #1a2b3c, rgb(26, 43, 60), hsl(210, 40%, 20%)">
        {(p) => (
          <input
            {...p}
            className="pk-input"
            value={draft}
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value);
              setErr('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              } else if (e.key === 'Escape') onCancel();
            }}
          />
        )}
      </Field>
      <div className="pk-row">
        <Button variant="primary" onClick={save}>
          Save
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
