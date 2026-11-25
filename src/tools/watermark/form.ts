import type { FontId, OutputMime, Placement, Position, Content, WatermarkSettings } from '@/engines/watermark/types';

export type Kind = 'text' | 'logo';
export type PlaceKind = 'grid' | 'tile';
export type FormatChoice = 'keep' | OutputMime;

/** Tool UI state. Numbers are numbers; an empty number field is NaN and fails validation. */
export type WatermarkForm = {
  kind: Kind;
  text: string;
  font: FontId;
  bold: boolean;
  logoId: string | null;
  whiteTransparent: boolean;
  color: string;
  /** 1..100, shown to the user. Converted to 0..1 for the engine. */
  opacity: number;
  sizePct: number;
  placement: PlaceKind;
  position: Position;
  marginPct: number;
  spacingPct: number;
  angle: number;
  format: FormatChoice;
  /** 1..100, shown to the user. Converted to 0..1 for the engine. */
  quality: number;
  selectedId: string | null;
  jobByInput: Record<string, string>;
};

export const INITIAL: WatermarkForm = {
  kind: 'text',
  text: 'Your name',
  font: 'inter',
  bold: false,
  logoId: null,
  whiteTransparent: false,
  color: '#ffffff',
  opacity: 75,
  sizePct: 5,
  placement: 'grid',
  position: 'br',
  marginPct: 3,
  spacingPct: 8,
  angle: -30,
  format: 'keep',
  quality: 85,
  selectedId: null,
  jobByInput: {},
};

const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

/** Validated engine settings, or the message to show next to the controls. */
export function toSettings(st: WatermarkForm): { ok: true; settings: WatermarkSettings } | { ok: false; error: string } {
  if (st.kind === 'text' && st.text.trim() === '') return { ok: false, error: 'Type the text to add.' };
  if (!inRange(st.sizePct, 1, 100)) return { ok: false, error: 'Enter a size from 1 to 100.' };
  if (!inRange(st.opacity, 1, 100)) return { ok: false, error: 'Enter an opacity from 1 to 100.' };
  if (!/^#[0-9a-f]{6}$/i.test(st.color)) return { ok: false, error: 'Pick a text colour.' };
  if (!inRange(st.quality, 1, 100)) return { ok: false, error: 'Enter a quality from 1 to 100.' };

  let placement: Placement;
  if (st.placement === 'grid') {
    if (!inRange(st.marginPct, 0, 50)) return { ok: false, error: 'Enter a margin from 0 to 50.' };
    placement = { kind: 'grid', position: st.position, marginPct: st.marginPct };
  } else {
    if (!inRange(st.spacingPct, 0, 100)) return { ok: false, error: 'Enter a spacing from 0 to 100.' };
    if (!inRange(st.angle, -90, 90)) return { ok: false, error: 'Enter an angle from -90 to 90.' };
    placement = { kind: 'tile', spacingPct: st.spacingPct, angle: st.angle };
  }

  const content: Content =
    st.kind === 'text' ? { kind: 'text', text: st.text.trim(), font: st.font, bold: st.bold } : { kind: 'logo', whiteTransparent: st.whiteTransparent };
  return {
    ok: true,
    settings: {
      content,
      color: st.color,
      opacity: st.opacity / 100,
      sizePct: st.sizePct,
      placement,
      format: st.format,
      quality: st.quality / 100,
    },
  };
}
