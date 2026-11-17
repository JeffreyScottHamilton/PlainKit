import { useEffect, useRef, useState } from 'react';
import { probeGif } from '@/engines/gif/client';
import type { FrameSpec, ProbeResult } from '@/engines/gif/types';
import { toToolError, type ToolError } from '@/lib/errors';

/** `key` re-runs the probe; `sourceKey` tells the editor when its frame list belongs to a different source. */
export type ProbeInput = { spec: FrameSpec; key: string; sourceKey: string };

export type ProbeState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  result: ProbeResult | null;
  error: ToolError | null;
  key: string | null;
  sourceKey: string | null;
};
const IDLE: ProbeState = { status: 'idle', result: null, error: null, key: null, sourceKey: null };

/**
 * Reads preview frames in a worker, debounced. Each new input cancels the previous read (the worker is terminated).
 * Bitmaps are closed when replaced, when the input clears, and on unmount.
 */
export function useProbe(input: ProbeInput | null): ProbeState {
  const [state, setState] = useState<ProbeState>(IDLE);
  const held = useRef<ProbeResult | null>(null);
  const release = () => {
    held.current?.frames.forEach((f) => f.bitmap.close());
    held.current = null;
  };

  useEffect(() => {
    if (!input) {
      release();
      setState(IDLE);
      return;
    }
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      setState((s) => ({ ...s, status: 'loading', key: input.key, sourceKey: input.sourceKey }));
      probeGif(input.spec, ctl.signal).then(
        (result) => {
          if (ctl.signal.aborted) {
            result.frames.forEach((f) => f.bitmap.close());
            return;
          }
          release();
          held.current = result;
          setState({ status: 'ready', result, error: null, key: input.key, sourceKey: input.sourceKey });
        },
        (e: unknown) => {
          if (ctl.signal.aborted) return;
          release();
          setState({ status: 'error', result: null, error: toToolError(e), key: input.key, sourceKey: input.sourceKey });
        },
      );
    }, 250);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
    // The input object is rebuilt on every render; its key decides when a new read starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input?.key]);

  useEffect(() => release, []);
  return state;
}
