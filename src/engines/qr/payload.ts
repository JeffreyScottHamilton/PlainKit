// Content encoders for QR codes. The output is the exact string that gets encoded: no redirects, no wrappers.

export type Content =
  | { kind: 'text'; text: string }
  | { kind: 'wifi'; ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass'; hidden: boolean }
  | { kind: 'vcard'; name: string; phone: string; email: string; org: string; url: string }
  | { kind: 'email'; to: string; subject: string; body: string }
  | { kind: 'phone'; number: string }
  | { kind: 'sms'; number: string; message: string };

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

/** Dialing digits: spaces, dashes, dots and brackets are dropped; an optional leading + stays. */
export function phoneDigits(s: string): string {
  return s.trim().replace(/[\s\-.()]/g, '');
}

/** mailto: with subject and body percent-encoded (spaces become %20, line breaks %0A). */
export function mailtoPayload(c: Extract<Content, { kind: 'email' }>): string {
  const query = [c.subject && `subject=${encodeURIComponent(c.subject)}`, c.body && `body=${encodeURIComponent(c.body)}`].filter(Boolean);
  return `mailto:${c.to.trim()}${query.length ? `?${query.join('&')}` : ''}`;
}

/** Message for an incomplete or invalid form, or null when the content can be encoded. */
export function contentProblem(c: Content): string | null {
  switch (c.kind) {
    case 'text':
      return c.text === '' ? 'Enter text or a URL to make a code.' : null;
    case 'wifi':
      return c.ssid === '' ? 'Enter a network name to make a Wi-Fi code.' : null;
    case 'vcard':
      return c.name.trim() === '' ? 'Enter a name to make a contact code.' : null;
    case 'email':
      return /^[^\s@]+@[^\s@]+$/.test(c.to.trim()) ? null : 'Enter an email address such as name@example.com.';
    case 'phone':
    case 'sms':
      return /^\+?\d{3,20}$/.test(phoneDigits(c.number)) ? null : 'Enter a phone number with digits, such as +1 555 0100.';
  }
}

/** Returns the payload, or null when the form is empty (nothing to encode). */
export function payloadFor(c: Content): string | null {
  if (contentProblem(c) !== null) return null;
  switch (c.kind) {
    case 'text':
      return c.text;
    case 'wifi':
      return wifiPayload(c);
    case 'vcard':
      return vcardPayload(c);
    case 'email':
      return mailtoPayload(c);
    case 'phone':
      return `tel:${phoneDigits(c.number)}`;
    case 'sms':
      return `SMSTO:${phoneDigits(c.number)}:${c.message}`;
  }
}
