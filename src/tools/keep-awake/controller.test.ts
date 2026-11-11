import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeepAwake, isTextTarget, type WakeLockApi, type WakeSentinel } from './controller';

class FakeSentinel extends EventTarget implements WakeSentinel {
  released = false;
  async release() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
  /** Simulates the browser or OS releasing the lock by itself. */
  systemRelease() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

class FakeDoc extends EventTarget {
  visibilityState = 'visible';
  show(state: 'visible' | 'hidden') {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function setup(opts: { refuse?: Error; supported?: boolean } = {}) {
  const sentinels: FakeSentinel[] = [];
  const wakeLock: WakeLockApi = {
    request: vi.fn(async () => {
      if (opts.refuse) throw opts.refuse;
      const s = new FakeSentinel();
      sentinels.push(s);
      return s;
    }),
  };
  const doc = new FakeDoc();
  const ctrl = createKeepAwake({
    wakeLock: opts.supported === false ? undefined : wakeLock,
    doc,
    now: () => Date.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  return { ctrl, doc, wakeLock, sentinels };
}

/** Lets pending promise callbacks run. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('support and user action', () => {
  it('reports unsupported and does nothing when the API is missing', () => {
    const { ctrl } = setup({ supported: false });
    ctrl.start(null);
    const s = ctrl.getState();
    expect(s.supported).toBe(false);
    expect(s.intent).toBe(false);
    expect(s.active).toBe(false);
  });

  it('never requests the lock until start is called', async () => {
    const { ctrl, wakeLock } = setup();
    await flush();
    expect(wakeLock.request).not.toHaveBeenCalled();
    ctrl.start(null);
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    expect(wakeLock.request).toHaveBeenCalledWith('screen');
    expect(ctrl.getState().active).toBe(true);
  });

  it('shows the refusal reason when the browser denies the request', async () => {
    const { ctrl } = setup({ refuse: Object.assign(new Error('low battery'), { name: 'NotAllowedError' }) });
    ctrl.start(null);
    await flush();
    const s = ctrl.getState();
    expect(s.active).toBe(false);
    expect(s.intent).toBe(false);
    expect(s.error).toBe('NotAllowedError: low battery');
  });
});

describe('release and stop', () => {
  it('stop releases the sentinel and records "stopped by you"', async () => {
    const { ctrl, sentinels } = setup();
    ctrl.start(null);
    await flush();
    ctrl.stop();
    await flush();
    expect(sentinels[0]!.released).toBe(true);
    expect(ctrl.getState()).toMatchObject({ active: false, intent: false, reason: 'stopped' });
  });

  it('a system release ends intent and does not re-request on its own', async () => {
    const { ctrl, sentinels, wakeLock } = setup();
    ctrl.start(null);
    await flush();
    sentinels[0]!.systemRelease();
    await flush();
    expect(ctrl.getState()).toMatchObject({ active: false, intent: false, reason: 'system' });
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('a request that resolves after stop is released immediately', async () => {
    let resolve!: (s: FakeSentinel) => void;
    const wakeLock: WakeLockApi = { request: vi.fn(() => new Promise<WakeSentinel>((r) => (resolve = r))) };
    const ctrl = createKeepAwake({ wakeLock, doc: new FakeDoc(), now: () => Date.now(), setTimeout: (f, ms) => globalThis.setTimeout(f, ms), clearTimeout: (h) => globalThis.clearTimeout(h as never) });
    ctrl.start(null);
    ctrl.stop();
    const late = new FakeSentinel();
    resolve(late);
    await flush();
    expect(late.released).toBe(true);
    expect(ctrl.getState().active).toBe(false);
  });
});

describe('timer', () => {
  it('releases when the timer expires', async () => {
    const { ctrl, sentinels } = setup();
    ctrl.start(15);
    await flush();
    expect(ctrl.getState().endsAt).not.toBeNull();
    vi.advanceTimersByTime(14 * 60_000);
    expect(sentinels[0]!.released).toBe(false);
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(sentinels[0]!.released).toBe(true);
    expect(ctrl.getState()).toMatchObject({ active: false, intent: false, reason: 'timer', endsAt: null });
  });

  it('does not re-acquire on visible after the timer has passed', async () => {
    const { ctrl, doc, wakeLock, sentinels } = setup();
    ctrl.start(1);
    await flush();
    doc.show('hidden');
    sentinels[0]!.systemRelease();
    vi.setSystemTime(Date.now() + 2 * 60_000);
    doc.show('visible');
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    expect(ctrl.getState()).toMatchObject({ intent: false, reason: 'timer' });
  });
});

describe('visibility', () => {
  it('a hidden tab releases with reason "tab hidden" and keeps intent', async () => {
    const { ctrl, doc, sentinels } = setup();
    ctrl.start(null);
    await flush();
    doc.visibilityState = 'hidden';
    sentinels[0]!.systemRelease();
    await flush();
    expect(ctrl.getState()).toMatchObject({ active: false, intent: true, reason: 'tab-hidden' });
  });

  it('re-requests when visible again while intent is on', async () => {
    const { ctrl, doc, sentinels, wakeLock } = setup();
    ctrl.start(null);
    await flush();
    doc.visibilityState = 'hidden';
    sentinels[0]!.systemRelease();
    doc.show('visible');
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
    expect(ctrl.getState()).toMatchObject({ active: true, intent: true, reason: null });
  });

  it('does not re-request when the user has stopped', async () => {
    const { ctrl, doc, wakeLock } = setup();
    ctrl.start(null);
    await flush();
    ctrl.stop();
    doc.show('hidden');
    doc.show('visible');
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('surfaces the error when re-acquiring fails', async () => {
    const { ctrl, doc, sentinels, wakeLock } = setup();
    ctrl.start(null);
    await flush();
    vi.mocked(wakeLock.request).mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    doc.visibilityState = 'hidden';
    sentinels[0]!.systemRelease();
    doc.show('visible');
    await flush();
    expect(ctrl.getState()).toMatchObject({ active: false, intent: false, error: 'NotAllowedError: denied' });
  });
});

describe('stop key', () => {
  it('stops on the configured key when focus is outside text fields', async () => {
    const { ctrl, sentinels } = setup();
    ctrl.start(null);
    await flush();
    ctrl.handleKey('Enter', {});
    expect(sentinels[0]!.released).toBe(false);
    ctrl.handleKey('Escape', { tagName: 'BUTTON' });
    await flush();
    expect(sentinels[0]!.released).toBe(true);
    expect(ctrl.getState().reason).toBe('stopped');
  });

  it('is ignored while focus is in an input, textarea, select or editable element', async () => {
    const { ctrl, sentinels } = setup();
    ctrl.start(null);
    await flush();
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'textarea' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
      ctrl.handleKey('Escape', target);
    }
    await flush();
    expect(sentinels[0]!.released).toBe(false);
    expect(ctrl.getState().active).toBe(true);
  });

  it('uses the chosen key only', async () => {
    const { ctrl, sentinels } = setup();
    ctrl.setStopKey('F8');
    ctrl.start(null);
    await flush();
    ctrl.handleKey('Escape', {});
    expect(sentinels[0]!.released).toBe(false);
    ctrl.handleKey('F8', {});
    await flush();
    expect(sentinels[0]!.released).toBe(true);
  });

  it('isTextTarget recognises editable targets', () => {
    expect(isTextTarget(null)).toBe(false);
    expect(isTextTarget({ tagName: 'P' })).toBe(false);
    expect(isTextTarget({ tagName: 'input' })).toBe(true);
  });
});

describe('subscribe', () => {
  it('notifies subscribers on state changes and stops after unsubscribe', async () => {
    const { ctrl } = setup();
    const fn = vi.fn();
    const off = ctrl.subscribe(fn);
    ctrl.start(null);
    expect(fn).toHaveBeenCalled();
    off();
    fn.mockClear();
    ctrl.stop();
    expect(fn).not.toHaveBeenCalled();
  });
});
