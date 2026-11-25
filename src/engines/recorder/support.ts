export type Mode = 'screen' | 'camera' | 'voice';

/** What this browser offers. Read from the live globals in the UI, passed in by tests. */
export type CapabilityEnv = { mediaRecorder: boolean; getDisplayMedia: boolean; getUserMedia: boolean };

export type ModeSupport = { ok: true } | { ok: false; reason: string };

export function modeSupport(mode: Mode, env: CapabilityEnv): ModeSupport {
  if (!env.mediaRecorder) return { ok: false, reason: 'This browser cannot record media (MediaRecorder is missing), so recording is not available here.' };
  if (mode === 'screen' && !env.getDisplayMedia)
    return { ok: false, reason: 'This browser cannot share the screen. Screen recording needs a desktop browser; most phones cannot share the screen. Use Camera or Voice memo instead.' };
  if (mode !== 'screen' && !env.getUserMedia) return { ok: false, reason: 'This browser cannot access the camera or microphone, so this mode is not available here.' };
  return { ok: true };
}

export function currentEnv(): CapabilityEnv {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  return {
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    getDisplayMedia: typeof md?.getDisplayMedia === 'function',
    getUserMedia: typeof md?.getUserMedia === 'function',
  };
}
