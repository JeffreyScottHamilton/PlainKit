export type UrlMode = 'component' | 'uri';
export type UrlOutcome = { ok: true; text: string } | { ok: false; message: string };

export function urlEncode(text: string, mode: UrlMode): UrlOutcome {
  try {
    return { ok: true, text: mode === 'component' ? encodeURIComponent(text) : encodeURI(text) };
  } catch {
    return { ok: false, message: 'Input contains an unpaired surrogate (a broken emoji or character) and cannot be percent-encoded.' };
  }
}

export function urlDecode(text: string, mode: UrlMode): UrlOutcome {
  try {
    return { ok: true, text: mode === 'component' ? decodeURIComponent(text) : decodeURI(text) };
  } catch {
    return {
      ok: false,
      message: 'Malformed percent-encoding. A "%" must be followed by two hex digits (for example %20), and the bytes must form valid UTF-8.',
    };
  }
}
