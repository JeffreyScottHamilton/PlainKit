// Content encoders for QR codes. The output is the exact string that gets encoded: no redirects, no wrappers.

export type Content =
  | { kind: 'text'; text: string }
  | { kind: 'wifi'; ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass'; hidden: boolean }
  | { kind: 'vcard'; name: string; phone: string; email: string; org: string; url: string };

/** Escapes the characters the Wi-Fi QR format reserves: backslash, semicolon, comma, colon and double quote. */
export function escapeWifi(s: string): string {
  return s.replace(/[\\;,:"]/g, (c) => `\\${c}`);
}

export function wifiPayload(c: Extract<Content, { kind: 'wifi' }>): string {
  const pass = c.security === 'nopass' ? '' : `P:${escapeWifi(c.password)};`;
  return `WIFI:T:${c.security};S:${escapeWifi(c.ssid)};${pass}H:${c.hidden ? 'true' : 'false'};;`;
}

/** vCard 3.0 values escape backslash, semicolon, comma and newline. */
export function escapeVcard(s: string): string {
  return s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
}

export function vcardPayload(c: Extract<Content, { kind: 'vcard' }>): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escapeVcard(c.name)};;;;`, `FN:${escapeVcard(c.name)}`];
  if (c.org) lines.push(`ORG:${escapeVcard(c.org)}`);
  if (c.phone) lines.push(`TEL:${escapeVcard(c.phone)}`);
  if (c.email) lines.push(`EMAIL:${escapeVcard(c.email)}`);
  if (c.url) lines.push(`URL:${escapeVcard(c.url)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/** Returns the payload, or null when the form is empty (nothing to encode). */
export function payloadFor(c: Content): string | null {
  switch (c.kind) {
    case 'text':
      return c.text === '' ? null : c.text;
    case 'wifi':
      return c.ssid === '' ? null : wifiPayload(c);
    case 'vcard':
      return c.name.trim() === '' ? null : vcardPayload(c);
  }
}
