import { useEffect, useMemo, useRef, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { downloadAsset } from '@/components/AssetList';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { ToolError } from '@/lib/errors';
import { outputName } from '@/lib/format';
import { addGenerated } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { colorWarnings, parseHex, readBack } from '@/engines/qr/check';
import { payloadFor, type Content } from '@/engines/qr/payload';
import { logoLayout, makeMatrix, renderPixels, svgFor, type Ecc, type QrMatrix, type Rgb } from '@/engines/qr/render';
import './qr-code.css';

type Kind = 'text' | 'wifi' | 'vcard';
type Security = 'WPA' | 'WEP' | 'nopass';
type State = {
  kind: Kind;
  text: string;
  ssid: string;
  password: string;
  security: Security;
  hidden: boolean;
  name: string;
  phone: string;
  email: string;
  org: string;
  site: string;
  ecc: Ecc;
  size: string;
  margin: string;
  dark: string;
  light: string;
  logo: Blob | null;
  logoName: string;
};
const INITIAL: State = {
  kind: 'text', text: '', ssid: '', password: '', security: 'WPA', hidden: false, name: '', phone: '', email: '', org: '', site: '',
  ecc: 'M', size: '512', margin: '4', dark: '#000000', light: '#ffffff', logo: null, logoName: '',
};

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'text', label: 'Text or URL' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'vcard', label: 'Contact' },
];
const ECC_OPTIONS: { value: Ecc; label: string }[] = [
  { value: 'L', label: 'L' },
  { value: 'M', label: 'M' },
  { value: 'Q', label: 'Q' },
  { value: 'H', label: 'H' },
];
const SECURITY_OPTIONS: { value: Security; label: string }[] = [
  { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: 'Open (no password)' },
];
const BASE_NAME: Record<Kind, string> = { text: 'qr-code', wifi: 'wifi-qr-code', vcard: 'contact-qr-code' };
const LOGO_MAX_COVERAGE = 0.2;

function contentOf(s: State): Content {
  switch (s.kind) {
    case 'text':
      return { kind: 'text', text: s.text };
    case 'wifi':
      return { kind: 'wifi', ssid: s.ssid, password: s.password, security: s.security, hidden: s.hidden };
    case 'vcard':
      return { kind: 'vcard', name: s.name, phone: s.phone, email: s.email, org: s.org, url: s.site };
  }
}

type Model =
  | { ok: false; message: string }
  | { ok: true; payload: string; matrix: QrMatrix; px: number; margin: number; fg: Rgb; bg: Rgb; ecc: Ecc; warnings: string[] };

/** Everything the preview and exports need, or the reason they cannot be made. Pure. */
function buildModel(s: State): Model {
  const payload = payloadFor(contentOf(s));
  if (payload === null) return { ok: false, message: s.kind === 'text' ? 'Enter text or a URL to make a code.' : s.kind === 'wifi' ? 'Enter a network name to make a Wi-Fi code.' : 'Enter a name to make a contact code.' };
  const px = Number(s.size);
  if (!Number.isInteger(px) || px < 128 || px > 2048) return { ok: false, message: 'Size must be a whole number of pixels from 128 to 2048.' };
  const margin = Number(s.margin);
  if (!Number.isInteger(margin) || margin < 0 || margin > 8) return { ok: false, message: 'Margin must be a whole number of modules from 0 to 8.' };
  const fg = parseHex(s.dark);
  const bg = parseHex(s.light);
  if (!fg || !bg) return { ok: false, message: 'Colors must be six-digit hex values such as #1a2b3c.' };
  // A logo needs the most error correction, so H is forced while one is used.
  const ecc: Ecc = s.logo ? 'H' : s.ecc;
  let matrix: QrMatrix;
  try {
    matrix = makeMatrix(payload, ecc);
  } catch (e) {
    return { ok: false, message: e instanceof ToolError ? `${e.message} ${e.nextAction ?? ''}`.trim() : 'This code could not be made.' };
  }
  const warnings = [...colorWarnings(fg, bg)];
  if (margin < 4) warnings.push('Scanners expect a quiet zone of 4 modules. Use a margin of 4 or more.');
  if (px / (matrix.size + 2 * margin) < 2) warnings.push('Each module is under 2 pixels at this size. Use a larger size so scanners can read it.');
  return { ok: true, payload, matrix, px, margin, fg, bg, ecc, warnings };
}

export default function Tool() {
  const [s, setS] = useToolState<State>('qr-code', INITIAL);
  const model = useMemo(() => buildModel(s), [s]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logoBm, setLogoBm] = useState<{ src: Blob; bm: ImageBitmap } | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [check, setCheck] = useState<'none' | 'ok' | 'fail' | 'pending'>('none');

  // Decode the logo file once per file. Closing a bitmap happens only when it is replaced.
  useEffect(() => {
    if (!s.logo) return;
    let alive = true;
    let loaded: ImageBitmap | null = null;
    const src = s.logo;
    createImageBitmap(src).then(
      (bm) => {
        if (!alive) return bm.close();
        loaded = bm;
        setLogoError(null);
        setLogoBm({ src, bm });
      },
      () => {
        if (alive) setLogoError('This file could not be read as an image. Choose a PNG, JPEG or WebP file.');
      },
    );
    return () => {
      alive = false;
      loaded?.close();
    };
  }, [s.logo]);

  // Draw the preview, then read it back with an independent decoder.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !model.ok) {
      setCheck('none');
      return;
    }
    const { matrix, px, margin, fg, bg, payload } = model;
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const img = ctx.createImageData(px, px);
    img.data.set(renderPixels(matrix, { px, margin, dark: fg, light: bg }));
    ctx.putImageData(img, 0, 0);
    const logo = s.logo ? (logoBm?.src === s.logo ? logoBm.bm : null) : null;
    if (s.logo && !logo) {
      setCheck('pending');
      return;
    }
    if (logo) {
      const L = logoLayout(px, logo.width, logo.height);
      ctx.fillStyle = `rgb(${bg.join(',')})`;
      ctx.fillRect(L.x - L.pad, L.y - L.pad, L.w + 2 * L.pad, L.h + 2 * L.pad);
      ctx.drawImage(logo, L.x, L.y, L.w, L.h);
    }
    const decoded = readBack(ctx.getImageData(0, 0, px, px).data, px, px);
    setCheck(decoded === payload ? 'ok' : 'fail');
  }, [model, s.logo, logoBm]);

  const logoCoverage = model.ok && logoBm?.src === s.logo && s.logo ? logoLayout(model.px, logoBm.bm.width, logoBm.bm.height).coverage : 0;
  const warnings = model.ok ? [...model.warnings] : [];
  if (logoCoverage > LOGO_MAX_COVERAGE) warnings.push('The logo covers more than 20% of the code. Use a smaller logo.');

  const exportBase = BASE_NAME[s.kind];
  const exportable = model.ok && check !== 'pending';

  const downloadPng = () => {
    if (!model.ok || !canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob || blob.type !== 'image/png') return;
      const asset = addGenerated({ name: outputName(exportBase, '', 'png'), mime: 'image/png', blob, parentIds: [] });
      downloadAsset(asset);
    }, 'image/png');
  };
  const downloadSvg = async () => {
    if (!model.ok) return;
    const svg = await svgFor(model.payload, model.ecc, { px: model.px, margin: model.margin, dark: model.fg, light: model.bg });
    const asset = addGenerated({ name: outputName(exportBase, '', 'svg'), mime: 'image/svg+xml', blob: new Blob([svg], { type: 'image/svg+xml' }), parentIds: [] });
    downloadAsset(asset);
  };

  return (
    <ToolPage
      toolId="qr-code"
      settings={
        <div className="qr-settings">
          <div className="pk-stack" style={{ gap: 4 }}>
            <Segmented label="Error correction" value={s.logo ? 'H' : s.ecc} options={ECC_OPTIONS} onChange={(ecc) => setS({ ecc })} />
            <span className="pk-hint">{s.logo ? 'Set to H while a logo is used.' : 'Higher levels survive damage but hold less data.'}</span>
          </div>
          <Field label="Size (pixels)" hint="128 to 2048">
            {(a) => <input {...a} className="pk-input" type="number" min={128} max={2048} step={1} value={s.size} onChange={(e) => setS({ size: e.target.value })} />}
          </Field>
          <Field label="Margin (modules)" hint="Quiet zone around the code. 4 is the standard.">
            {(a) => <input {...a} className="pk-input" type="number" min={0} max={8} step={1} value={s.margin} onChange={(e) => setS({ margin: e.target.value })} />}
          </Field>
          <Field label="Code color" hint={`Foreground ${s.dark}`}>
            {(a) => <input {...a} type="color" value={s.dark} onChange={(e) => setS({ dark: e.target.value })} className="qr-color" />}
          </Field>
          <Field label="Background color" hint={`Background ${s.light}`}>
            {(a) => <input {...a} type="color" value={s.light} onChange={(e) => setS({ light: e.target.value })} className="qr-color" />}
          </Field>
          <Field label="Center logo (optional)" hint="Image stays in this browser. PNG downloads include it; SVG downloads do not.">
            {(a) => (
              <input
                {...a}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setS({ logo: f, logoName: f.name });
                  e.target.value = '';
                }}
              />
            )}
          </Field>
          {s.logo && (
            <div className="pk-row" style={{ gap: 8 }}>
              <span className="mono">{s.logoName}</span>
              <Button size="sm" onClick={() => setS({ logo: null, logoName: '' })}>
                Remove logo
              </Button>
            </div>
          )}
          {logoError && <Notice kind="error">{logoError}</Notice>}
        </div>
      }
    >
      <section className="qr-section" aria-labelledby="qr-content-h">
        <h2 id="qr-content-h">Content</h2>
        <Segmented label="Content type" value={s.kind} options={KIND_OPTIONS} onChange={(kind) => setS({ kind })} />
        {s.kind === 'text' && (
          <Field label="Text or URL" hint="Encoded directly. No redirect, no tracking, no network request.">
            {(a) => <textarea {...a} className="pk-textarea" rows={3} spellCheck={false} value={s.text} onChange={(e) => setS({ text: e.target.value })} />}
          </Field>
        )}
        {s.kind === 'wifi' && (
          <div className="qr-fields">
            <Field label="Network name (SSID)">{(a) => <input {...a} className="pk-input" type="text" value={s.ssid} onChange={(e) => setS({ ssid: e.target.value })} />}</Field>
            <Field label="Password">
              {(a) => (
                <input {...a} className="pk-input" type="password" autoComplete="off" value={s.password} disabled={s.security === 'nopass'} onChange={(e) => setS({ password: e.target.value })} />
              )}
            </Field>
            <Field label="Security">
              {(a) => (
                <select {...a} className="pk-select" value={s.security} onChange={(e) => setS({ security: e.target.value as Security })}>
                  {SECURITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <label className="pk-check">
              <input type="checkbox" checked={s.hidden} onChange={(e) => setS({ hidden: e.target.checked })} />
              Hidden network
            </label>
          </div>
        )}
        {s.kind === 'vcard' && (
          <div className="qr-fields">
            <Field label="Name">{(a) => <input {...a} className="pk-input" type="text" value={s.name} onChange={(e) => setS({ name: e.target.value })} />}</Field>
            <Field label="Phone">{(a) => <input {...a} className="pk-input" type="tel" value={s.phone} onChange={(e) => setS({ phone: e.target.value })} />}</Field>
            <Field label="Email">{(a) => <input {...a} className="pk-input" type="email" value={s.email} onChange={(e) => setS({ email: e.target.value })} />}</Field>
            <Field label="Organization">{(a) => <input {...a} className="pk-input" type="text" value={s.org} onChange={(e) => setS({ org: e.target.value })} />}</Field>
            <Field label="Website">{(a) => <input {...a} className="pk-input" type="url" value={s.site} onChange={(e) => setS({ site: e.target.value })} />}</Field>
          </div>
        )}
      </section>

      <section className="qr-section" aria-labelledby="qr-prev-h">
        <h2 id="qr-prev-h">Preview</h2>
        {!model.ok && <Notice kind={s.text || s.ssid || s.name ? 'error' : 'info'}>{model.message}</Notice>}
        <canvas ref={canvasRef} className="qr-canvas" role="img" aria-label="QR code preview" hidden={!model.ok} />
        {model.ok && check === 'ok' && <Notice kind="success">Checked: decodes to the same content.</Notice>}
        {model.ok && check === 'fail' && (
          <Notice kind="warn">This code could not be read back. Try higher contrast, a smaller logo, or more margin.</Notice>
        )}
        {model.ok && check === 'pending' && <p className="qr-note">Loading the logo…</p>}
        {warnings.map((w) => (
          <Notice key={w} kind="warn">
            {w}
          </Notice>
        ))}
        <p className="qr-note">
          The check decodes this preview with one independent decoder. It does not guarantee every scanner or device will read the code.
        </p>
      </section>

      <section className="qr-section" aria-labelledby="qr-dl-h">
        <h2 id="qr-dl-h">Download</h2>
        <div className="pk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" disabled={!exportable} onClick={downloadPng}>
            Download PNG
          </Button>
          <Button disabled={!exportable} onClick={() => void downloadSvg()}>
            Download SVG
          </Button>
        </div>
        {s.logo && <p className="qr-note">SVG files do not include the logo. Only the PNG has it.</p>}
        <p className="qr-note">Downloads are also added to this session, so other tools can use them.</p>
      </section>
    </ToolPage>
  );
}
