import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import type { FontId } from './types';

export const FONT_OPTIONS: readonly { id: FontId; label: string }[] = [
  { id: 'inter', label: 'Inter' },
  { id: 'sans', label: 'System sans-serif' },
  { id: 'serif', label: 'System serif' },
  { id: 'mono', label: 'System monospace' },
];

const STACK: Record<FontId, string> = {
  inter: '"PK Inter", system-ui, sans-serif',
  sans: 'system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
};

let inter: Promise<boolean> | null = null;

/**
 * Registers the bundled Inter in this realm (page or worker). Workers do not see the page's @font-face rules,
 * so the worker loads the same-origin file itself. Resolves false when it cannot load.
 */
export function loadInter(): Promise<boolean> {
  if (!inter) {
    inter = (async () => {
      try {
        const res = await fetch(interUrl);
        if (!res.ok) return false;
        const face = new FontFace('PK Inter', await res.arrayBuffer(), { weight: '100 900' });
        await face.load();
        fonts.add(face);
        return true;
      } catch {
        return false;
      }
    })();
  }
  return inter;
}

/** CSS font-family for canvas text. Inter falls back to the system sans when it did not load. */
export function fontCss(id: FontId, interReady: boolean): string {
  return id === 'inter' && !interReady ? STACK.sans : STACK[id];
}
