import { useEffect, useRef, type ReactNode } from 'react';
import { Segmented } from './ui';
import { useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import type { SessionAsset } from '@/session/types';

export type Kind<K extends string> = { id: K; label: string; match: (a: SessionAsset) => boolean };

const ext = (a: SessionAsset) => a.name.slice(a.name.lastIndexOf('.') + 1).toLowerCase();
export const isImage = (a: SessionAsset) => a.mime.startsWith('image/');
export const isMedia = (a: SessionAsset) => a.mime.startsWith('video/') || a.mime.startsWith('audio/');
export const isPdf = (a: SessionAsset) => a.mime === 'application/pdf' || ext(a) === 'pdf';
export const isMesh = (a: SessionAsset) => a.mime.startsWith('model/') || ['obj', 'stl', 'ply'].includes(ext(a));

/**
 * A tool with several file kinds shows one panel per kind. The tab follows the most recently added file,
 * and the user can switch by hand. Returns the active kind and the tab control to pass to ToolPage.
 */
export function useKindTabs<K extends string>(toolId: string, kinds: Kind<K>[]): { kind: K; tabs: ReactNode } {
  const inputs = useToolInputs(toolId);
  const [st, set] = useToolState<{ kind: K }>(`${toolId}:kind`, { kind: kinds[0]!.id });
  const seen = useRef(inputs.length);
  useEffect(() => {
    if (inputs.length > seen.current) {
      const last = inputs[inputs.length - 1]!;
      const k = kinds.find((x) => x.match(last));
      if (k && k.id !== st.kind) set({ kind: k.id });
    }
    seen.current = inputs.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.length]);
  const tabs = <Segmented label="File type" value={st.kind} options={kinds.map((k) => ({ value: k.id, label: k.label }))} onChange={(kind) => set({ kind })} />;
  return { kind: st.kind, tabs: <div style={{ maxWidth: 560 }}>{tabs}</div> };
}
