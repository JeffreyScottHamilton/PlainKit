import { useEffect, useMemo, useState } from 'react';
import type { SessionAsset } from '@/session/types';
import { toToolError, type ToolError } from '@/lib/errors';
import { probeEncoders, type EncoderSupport } from './probe';
import { sniffBlob, type ImageMime } from './sniff';
import { inspectImage } from './client';
import type { InspectResult } from './types';

/** Encoder support for this browser; null while the probe runs. */
export function useEncoderSupport(): EncoderSupport | null {
  const [support, setSupport] = useState<EncoderSupport | null>(null);
  useEffect(() => {
    let alive = true;
    void probeEncoders().then((s) => {
      if (alive) setSupport(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return support;
}

// Results are cached per Blob (WeakMap), so they survive re-renders and route changes.
const sniffCache = new WeakMap<Blob, ImageMime | null>();

/** Content-sniffed format per asset id. Missing key = still sniffing. */
export function useSniffed(assets: readonly SessionAsset[]): ReadonlyMap<string, ImageMime | null> {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    for (const a of assets) {
      if (sniffCache.has(a.blob)) continue;
      void sniffBlob(a.blob).then((m) => {
        sniffCache.set(a.blob, m);
        if (alive) setVersion((v) => v + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, [assets]);
  return useMemo(() => {
    void version;
    const m = new Map<string, ImageMime | null>();
    for (const a of assets) if (sniffCache.has(a.blob)) m.set(a.id, sniffCache.get(a.blob) ?? null);
    return m;
  }, [assets, version]);
}

export type InspectState = { ok: true; info: InspectResult } | { ok: false; error: ToolError };
const inspectCache = new WeakMap<Blob, InspectState>();

/** Decodes each asset once (sequentially) to learn alpha/animation. Pass only sniffed image assets. */
export function useInspected(assets: readonly SessionAsset[]): ReadonlyMap<string, InspectState> {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const todo = assets.filter((a) => !inspectCache.has(a.blob));
    if (!todo.length) return;
    let alive = true;
    void (async () => {
      for (const a of todo) {
        if (!alive) return;
        try {
          inspectCache.set(a.blob, { ok: true, info: await inspectImage(a.blob) });
        } catch (e) {
          inspectCache.set(a.blob, { ok: false, error: toToolError(e) });
        }
        if (alive) setVersion((v) => v + 1);
      }
    })();
    return () => {
      alive = false;
    };
  }, [assets]);
  return useMemo(() => {
    void version;
    const m = new Map<string, InspectState>();
    for (const a of assets) {
      const s = inspectCache.get(a.blob);
      if (s) m.set(a.id, s);
    }
    return m;
  }, [assets, version]);
}
