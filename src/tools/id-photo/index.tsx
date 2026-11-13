import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { assetUrl, removeInput, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { enqueue, useJobs } from '@/jobs/queue';
import type { Job } from '@/jobs/types';
import { outputName } from '@/lib/format';
import { PRESETS, presetById, type Preset } from '@/engines/idphoto/presets';
import {
  PAPERS,
  clampPan,
  cropRect,
  defaultPan,
  eyeLineBand,
  headBand,
  layoutSheet,
  MAX_ZOOM,
  outputPx,
  parseMm,
  type Dpi,
  type Pan,
  type Paper,
  type Rect,
} from '@/engines/idphoto/geometry';
import { decodeSource, renderPhoto, renderSheet } from '@/engines/idphoto/render';
import './id-photo.css';

type Stored = { presetId: string; customW: string; customH: string; dpi: Dpi; paperId: string; cutMarks: boolean; pan: Pan | null; panFor: string | null };
const INITIAL: Stored = { presetId: 'uk-passport', customW: '35', customH: '45', dpi: 300, paperId: '4x6', cutMarks: true, pan: null, panFor: null };
const COUNTRY_ORDER = [...new Set(PRESETS.map((p) => p.country))];
const mm = (n: number) => String(n);

export default function Tool() {
  const inputs = useToolInputs('id-photo');
  const [st, set] = useToolState<Stored>('id-photo', INITIAL);
  const jobs = useJobs('id-photo');
  const preset = presetById(st.presetId) ?? PRESETS[0]!;
  const paper = PAPERS.find((p) => p.id === st.paperId) ?? PAPERS[0]!;
  const size = preset.id === 'custom' ? sizeFromCustom(st) : { wMm: preset.widthMm, hMm: preset.heightMm };
  const asset = inputs[0];

  const settings = (
    <div className="pk-stack">
      <h2>Photo</h2>
      <Field label="Document preset" hint={preset.document}>
        {(p) => (
          <select {...p} className="pk-select" value={preset.id} onChange={(e) => set({ presetId: e.target.value, pan: null, panFor: null })}>
            {COUNTRY_ORDER.map((country) => (
              <optgroup key={country} label={country}>
                {PRESETS.filter((x) => x.country === country).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.document}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </Field>
      {preset.id === 'custom' && (
        <div className="ip-custom">
          <Field label="Width (mm)" error={size ? undefined : 'Enter a width and height from 5 to 300 mm.'}>
            {(p) => <input {...p} className="pk-input" inputMode="decimal" value={st.customW} onChange={(e) => set({ customW: e.target.value })} />}
          </Field>
          <Field label="Height (mm)">
            {(p) => <input {...p} className="pk-input" inputMode="decimal" value={st.customH} onChange={(e) => set({ customH: e.target.value })} />}
          </Field>
        </div>
      )}
      <Field label="Print resolution" hint="Pixels per inch in the exported files.">
        {() => (
          <Segmented<'300' | '600'>
            label="Print resolution"
            value={String(st.dpi) as '300' | '600'}
            options={[
              { value: '300', label: '300 DPI' },
              { value: '600', label: '600 DPI' },
            ]}
            onChange={(v) => set({ dpi: Number(v) as Dpi })}
          />
        )}
      </Field>
      <Field label="Paper for print sheet">
        {(p) => (
          <select {...p} className="pk-select" value={paper.id} onChange={(e) => set({ paperId: e.target.value })}>
            {PAPERS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="ip-check">
        <input type="checkbox" checked={st.cutMarks} onChange={(e) => set({ cutMarks: e.target.checked })} /> Print cut marks
      </label>
      <p className="ip-note">Background: {preset.background}. This tool does not change the background. Use Cutout first if needed.</p>
      <ul className="ip-notes">
        {preset.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <ToolPage toolId="id-photo" settings={settings}>
      <Notice kind="warn">Guides only. Acceptance is decided by the issuing authority. This tool does not check compliance.</Notice>
      {asset ? (
        <Editor key={asset.id} asset={asset} st={st} set={set} preset={preset} size={size} paper={paper} jobs={jobs} onRemove={() => removeInput('id-photo', asset.id)} />
      ) : (
        <DropZone toolId="id-photo" multiple={false} hint="JPEG, PNG or WebP. Processed in this browser. Nothing is uploaded." />
      )}
    </ToolPage>
  );
}

function sizeFromCustom(st: Stored): { wMm: number; hMm: number } | null {
  const w = parseMm(st.customW);
  const h = parseMm(st.customH);
  return w && h ? { wMm: w, hMm: h } : null;
}

type EditorProps = {
  asset: SessionAsset;
  st: Stored;
  set: (p: Partial<Stored>) => void;
  preset: Preset;
  size: { wMm: number; hMm: number } | null;
  paper: Paper;
  jobs: Job[];
  onRemove: () => void;
};

function Editor({ asset, st, set, preset, size, paper, jobs, onRemove }: EditorProps) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; pan: Pan } | null>(null);
  const aspect = size ? size.wMm / size.hMm : 1;
  const pan: Pan | null = dims ? (st.panFor === asset.id && st.pan ? clampPan(st.pan, dims.w, dims.h, aspect) : defaultPan(dims.w, dims.h)) : null;
  const crop: Rect | null = dims && size ? cropRect(dims.w, dims.h, aspect, pan!) : null;
  const ready = !!(dims && size && crop);

  const setPan = (p: Pan) => {
    if (!dims) return;
    set({ pan: clampPan(p, dims.w, dims.h, aspect), panFor: asset.id });
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!pan) return;
    drag.current = { x: e.clientX, y: e.clientY, pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !crop || !stageRef.current) return;
    const scale = stageRef.current.getBoundingClientRect().width / crop.w;
    setPan({ ...d.pan, cx: d.pan.cx - (e.clientX - d.x) / scale, cy: d.pan.cy - (e.clientY - d.y) / scale });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!pan || !crop) return;
    const step = crop.w * (e.shiftKey ? 0.1 : 0.02);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      setPan({ ...pan, cx: pan.cx + m[0] * step, cy: pan.cy + m[1] * step });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setPan({ ...pan, zoom: pan.zoom * 1.1 });
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setPan({ ...pan, zoom: pan.zoom / 1.1 });
    }
  };

  const exportPhoto = () => {
    if (!crop || !size) return;
    const c = crop;
    const s = size;
    const dpi = st.dpi;
    enqueue({
      toolId: 'id-photo',
      label: `Export photo ${asset.name}`,
      inputIds: [asset.id],
      run: async () => {
        const bmp = await decodeSource(asset.blob);
        try {
          const blob = await renderPhoto(bmp, c, s, dpi);
          return { outputs: [{ name: outputName(asset.name, 'id', 'jpg'), mime: 'image/jpeg', blob }] };
        } finally {
          bmp.close();
        }
      },
    });
  };

  const exportSheet = () => {
    if (!crop || !size) return;
    const c = crop;
    const s = size;
    const dpi = st.dpi;
    const cut = st.cutMarks;
    const sheet = layoutSheet(paper, s);
    enqueue({
      toolId: 'id-photo',
      label: `Export print sheet ${asset.name}`,
      inputIds: [asset.id],
      run: async () => {
        const bmp = await decodeSource(asset.blob);
        try {
          const jpeg = new Uint8Array(await (await renderPhoto(bmp, c, s, dpi)).arrayBuffer());
          const blob = await renderSheet(jpeg, s, paper, sheet, cut);
          return { outputs: [{ name: outputName(asset.name, 'id-sheet', 'pdf'), mime: 'application/pdf', blob }] };
        } finally {
          bmp.close();
        }
      },
    });
  };

  const px = size ? outputPx(size.wMm, size.hMm, st.dpi) : null;
  const sheet = size ? layoutSheet(paper, size) : null;
  const eye = size ? eyeLineBand(size.hMm, preset.eyeLineFromBottomMm) : null;
  const head = size ? headBand(size.hMm, preset.headHeightMm) : null;
  const myJobs = jobs.filter((j) => j.inputIds.includes(asset.id));

  return (
    <>
      <section aria-labelledby="ip-out-h" className="ip-out">
        <h2 id="ip-out-h">Export</h2>
        <p className="ip-readout" aria-live="polite">
          {size && px
            ? `Photo: ${mm(size.wMm)} × ${mm(size.hMm)} mm · ${px.w} × ${px.h} px at ${st.dpi} DPI`
            : 'Enter a valid width and height to see the size.'}
        </p>
        {sheet && <p className="ip-readout">{`Print sheet: ${sheet.count} photo${sheet.count === 1 ? '' : 's'} on ${paper.name}, ${sheet.orientation}.`}</p>}
        <div className="pk-row">
          <Button variant="primary" disabled={!ready} onClick={exportPhoto}>
            Export photo
          </Button>
          <Button disabled={!ready || !sheet || sheet.count === 0} onClick={exportSheet}>
            Export print sheet (PDF)
          </Button>
        </div>
        <p className="ip-note">Print at 100% / actual size. Do not use &lsquo;fit to page&rsquo;.</p>
        <div className="pk-row">
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove photo from this tool
          </Button>
        </div>
      </section>

      <section aria-labelledby="ip-preview-h" className="ip-editor">
        <h2 id="ip-preview-h">Crop preview</h2>
        <div
          ref={stageRef}
          className="ip-stage"
          role="group"
          tabIndex={0}
          aria-label="Crop preview. Drag to move, or use the arrow keys to move. Plus and minus zoom."
          aria-describedby="ip-keys"
          style={size ? { aspectRatio: `${size.wMm} / ${size.hMm}` } : undefined}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKey}
        >
          {ready && crop && dims && (
            <img
              className="ip-img"
              src={assetUrl(asset)}
              alt=""
              draggable={false}
              style={{ width: `${(dims.w / crop.w) * 100}%`, left: `${-(crop.x / crop.w) * 100}%`, top: `${-(crop.y / crop.h) * 100}%` }}
            />
          )}
          {!ready && (
            <img className="ip-img ip-img--probe" src={assetUrl(asset)} alt={`Preview of ${asset.name}`} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          )}
          {ready && eye && (
            <>
              <div className="ip-band" style={{ top: `${eye.top * 100}%`, height: `${(eye.bottom - eye.top) * 100}%` }} aria-hidden />
              <div className="ip-line" style={{ top: `${eye.top * 100}%` }} aria-hidden />
              <div className="ip-line" style={{ top: `${eye.bottom * 100}%` }} aria-hidden />
              <span className="ip-label ip-label--eye" style={{ top: `${eye.top * 100}%` }} aria-hidden>
                Eye line {preset.eyeLineFromBottomMm![0]}–{preset.eyeLineFromBottomMm![1]} mm from bottom
              </span>
            </>
          )}
          {ready && head && (
            <>
              <div className="ip-bar" style={{ bottom: `${head.from * 100}%`, height: `${(head.to - head.from) * 100}%` }} aria-hidden />
              <span className="ip-label ip-label--head" aria-hidden>
                Head {preset.headHeightMm![0]}–{preset.headHeightMm![1]} mm
              </span>
            </>
          )}
        </div>
        <p id="ip-keys" className="ip-keys">
          Drag the photo, or focus the preview and use the arrow keys (Shift for bigger steps). Plus and minus change zoom.
        </p>
        <div className="ip-zoom">
          <Field label="Zoom">
            {(p) => (
              <input {...p} type="range" className="pk-range" min={1} max={MAX_ZOOM} step={0.01} value={pan?.zoom ?? 1} disabled={!ready} onChange={(e) => pan && setPan({ ...pan, zoom: Number(e.target.value) })} />
            )}
          </Field>
          <Button size="sm" disabled={!ready} onClick={() => dims && set({ pan: null, panFor: null })}>
            Center
          </Button>
        </div>
        <p className="ip-source">
          Source: {preset.sourceUrl ? <a href={preset.sourceUrl} rel="noreferrer noopener" target="_blank">{preset.sourceName}</a> : preset.sourceName}.{' '}
          {preset.sourceUrl && preset.lastChecked === null ? 'Not re-checked against the official source during this build. Confirm at the link before printing.' : null}
        </p>
      </section>


      <section aria-labelledby="ip-res-h" className="ip-results">
        <h2 id="ip-res-h">Results</h2>
        {myJobs.length === 0 && <p className="muted">Exports appear here.</p>}
        {myJobs.map((j) =>
          j.state === 'complete' && j.result ? (
            <ul key={j.id} className="pk-assets">
              {j.result.assets.map((a) => (
                <AssetRow key={a.id} asset={a} exclude="id-photo" />
              ))}
            </ul>
          ) : (
            <div key={j.id}>
              <JobStatus job={j} />
            </div>
          ),
        )}
      </section>
    </>
  );
}
