// Screen Wake Lock controller. Lives at module level so the lock survives route changes.
// The sentinel and intent are the source of truth; the UI only reads state through subscribe().

export type StopKey = 'Escape' | 'F8' | 'F9' | 'Pause';
export const STOP_KEYS: readonly StopKey[] = ['Escape', 'F8', 'F9', 'Pause'];

/** Why the lock is not held. 'tab-hidden' keeps the user's intent; 'system' ends it. */
export type ReleaseReason = 'stopped' | 'timer' | 'tab-hidden' | 'system';
export const REASON_TEXT: Record<ReleaseReason, string> = {
  stopped: 'stopped by you',
  timer: 'timer ended',
  'tab-hidden': 'tab hidden',
  system: 'released by the system',
};

export type WakeSentinel = {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
};
export type WakeLockApi = { request(type: 'screen'): Promise<WakeSentinel> };

export type KeepAwakeState = {
  supported: boolean;
  /** The user asked for the lock and has not stopped it, and the timer has not ended. */
  intent: boolean;
  /** The browser currently holds the lock (the sentinel is live). */
  active: boolean;
  reason: ReleaseReason | null;
  error: string | null;
  endsAt: number | null;
  /** Text for the polite status region. Changes only on start, stop, timer end and errors. */
  announcement: string;
  stopKey: StopKey;
};

export type ListenerTarget = {
  visibilityState: string;
  addEventListener(type: 'visibilitychange' | 'keydown', listener: (e: Event) => void): void;
  removeEventListener(type: 'visibilitychange' | 'keydown', listener: (e: Event) => void): void;
};

export type Deps = {
  wakeLock: WakeLockApi | undefined;
  doc: ListenerTarget;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type KeepAwake = {
  getState(): KeepAwakeState;
  subscribe(fn: () => void): () => void;
  /** Starts the lock. Call only from a user action. minutes null = until stopped. */
  start(minutes: number | null): void;
  stop(): void;
  setStopKey(key: StopKey): void;
  /** Stop-key handling. Ignored while focus is in a text field. */
  handleKey(key: string, target: unknown): void;
};

/** Focus inside an input, textarea, select or editable element means the key belongs to the user. */
export function isTextTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message || 'the browser refused the request'}`;
  return 'The browser refused the wake lock request.';
}

export function createKeepAwake(deps: Deps): KeepAwake {
  let state: KeepAwakeState = {
    supported: deps.wakeLock !== undefined,
    intent: false,
    active: false,
    reason: null,
    error: null,
    endsAt: null,
    announcement: '',
    stopKey: 'Escape',
  };
  let sentinel: WakeSentinel | null = null;
  let timer: unknown = null;
  let generation = 0;
  const subs = new Set<() => void>();

  const set = (patch: Partial<KeepAwakeState>) => {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
  };

  const onVisibility = () => {
    if (deps.doc.visibilityState !== 'visible' || !state.intent || state.active) return;
    if (state.endsAt !== null && deps.now() >= state.endsAt) return stop('timer');
    void acquire();
  };
  const onKeyEvent = (e: Event) => handleKey((e as KeyboardEvent).key, e.target);
  function handleKey(key: string, target: unknown) {
    if (!state.intent || key !== state.stopKey || isTextTarget(target)) return;
    stop('stopped');
  }

  const attach = () => {
    deps.doc.addEventListener('visibilitychange', onVisibility);
    deps.doc.addEventListener('keydown', onKeyEvent);
  };
  const detach = () => {
    deps.doc.removeEventListener('visibilitychange', onVisibility);
    deps.doc.removeEventListener('keydown', onKeyEvent);
  };
  const clearTimer = () => {
    if (timer !== null) deps.clearTimeout(timer);
    timer = null;
  };

  /** Ends the user's intent and releases the sentinel. The release event that follows is ignored. */
  function stop(reason: 'stopped' | 'timer') {
    generation++;
    clearTimer();
    detach();
    const held = sentinel;
    sentinel = null;
    set({
      intent: false,
      active: false,
      reason,
      endsAt: null,
      error: null,
      announcement: reason === 'timer' ? 'Keep awake timer ended. The screen can sleep again.' : 'Keep awake stopped.',
    });
    if (held && !held.released) void held.release().catch(() => undefined);
  }

  function fail(message: string) {
    clearTimer();
    detach();
    set({ intent: false, active: false, reason: 'system', endsAt: null, error: message, announcement: `Keep awake could not start. ${message}` });
  }

  async function acquire() {
    if (!deps.wakeLock) return;
    const my = ++generation;
    try {
      const s = await deps.wakeLock.request('screen');
      if (my !== generation || !state.intent) {
        // Stopped while the request was pending: give the lock straight back.
        if (!s.released) await s.release().catch(() => undefined);
        return;
      }
      sentinel = s;
      s.addEventListener('release', () => onRelease(s));
      set({ active: true, reason: null, error: null });
    } catch (e) {
      if (my !== generation) return;
      fail(describeError(e));
    }
  }

  function onRelease(s: WakeSentinel) {
    if (s !== sentinel) return; // our own stop() already handled it
    sentinel = null;
    if (deps.doc.visibilityState === 'hidden') {
      // The browser releases the lock when the tab hides. Keep intent so visibility can re-acquire it.
      set({ active: false, reason: 'tab-hidden' });
      return;
    }
    // Released while visible without us asking: the system or browser ended it. Do not fight it.
    clearTimer();
    detach();
    set({ intent: false, active: false, reason: 'system', endsAt: null, announcement: 'Keep awake was released by the system or browser.' });
  }

  return {
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    start(minutes) {
      if (!deps.wakeLock) {
        set({ supported: false });
        return;
      }
      clearTimer();
      const endsAt = minutes ? deps.now() + minutes * 60_000 : null;
      set({ intent: true, endsAt, error: null, reason: null, announcement: minutes ? `Keep awake started for ${minutes} minutes.` : 'Keep awake started.' });
      attach();
      if (endsAt !== null && minutes) timer = deps.setTimeout(() => stop('timer'), minutes * 60_000);
      if (!state.active) void acquire();
    },
    stop() {
      stop('stopped');
    },
    setStopKey(key) {
      set({ stopKey: key });
    },
    handleKey,
  };
}

function defaultWakeLock(): WakeLockApi | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const wl = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
  return wl && typeof wl.request === 'function' ? wl : undefined;
}

/** The app-wide controller. Created once; the tool UI subscribes to it. */
export const keepAwake: KeepAwake = createKeepAwake({
  wakeLock: defaultWakeLock(),
  doc: typeof document === 'undefined' ? { visibilityState: 'visible', addEventListener: () => undefined, removeEventListener: () => undefined } : document,
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
});
