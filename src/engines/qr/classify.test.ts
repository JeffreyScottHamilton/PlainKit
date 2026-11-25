import { describe, expect, it } from 'vitest';
import { classify, parseAddress, parseContact, parseWifi, splitRaw, urlWarnings } from './classify';
import { payloadFor, vcardPayload, wifiPayload } from './payload';

describe('URL classification', () => {
  it('shows the full URL and the host for a normal https link without warnings', () => {
    expect(classify('https://example.com/a?utm_source=x')).toEqual({ kind: 'url', url: 'https://example.com/a?utm_source=x', host: 'example.com', warnings: [] });
  });

  it('warns about an IP address host', () => {
    const c = classify('http://192.168.1.10:8080/login');
    expect(c).toMatchObject({ kind: 'url', host: '192.168.1.10', warnings: ['ip-address'] });
    expect(classify('https://[::1]/')).toMatchObject({ warnings: ['ip-address'] });
  });

  it('warns about punycode labels', () => {
    expect(classify('https://xn--pypal-4ve.example/')).toMatchObject({ kind: 'url', warnings: ['punycode'] });
    expect(classify('https://pаypal.com/')).toMatchObject({ warnings: ['punycode'] });
  });

  it('warns about known link shorteners', () => {
    expect(classify('https://bit.ly/3abc')).toMatchObject({ warnings: ['shortener'] });
    expect(classify('https://t.co/xyz')).toMatchObject({ warnings: ['shortener'] });
    expect(classify('https://example.com/')).toMatchObject({ warnings: [] });
  });

  it('warns about a username in the link', () => {
    expect(classify('https://user@example.com/')).toMatchObject({ warnings: ['username'] });
    expect(urlWarnings(new URL('https://a:b@example.com/'))).toEqual(['username']);
  });

  it('shows other schemes as text, never as a link', () => {
    expect(classify('javascript:alert(1)')).toEqual({ kind: 'text', text: 'javascript:alert(1)' });
    expect(classify('ftp://example.com/file')).toEqual({ kind: 'text', text: 'ftp://example.com/file' });
  });
});

describe('Wi-Fi parsing', () => {
  it('parses SSID, password, security and hidden flag', () => {
    expect(parseWifi('WIFI:T:WPA;S:Home;P:pw1;H:true;;')).toEqual({ kind: 'wifi', ssid: 'Home', password: 'pw1', security: 'WPA', hidden: true });
  });

  it('unescapes reserved characters in SSID and password', () => {
    const ssid = 'Cafe;Net,"A":1\\';
    const password = 'p@ss;w\\rd,1:"x"';
    expect(parseWifi(wifiPayload({ kind: 'wifi', ssid, password, security: 'WEP', hidden: false }))).toEqual({
      kind: 'wifi', ssid, password, security: 'WEP', hidden: false,
    });
  });

  it('reads open networks with an empty password', () => {
    expect(parseWifi('WIFI:T:nopass;S:Guest;H:false;;')).toEqual({ kind: 'wifi', ssid: 'Guest', password: '', security: 'nopass', hidden: false });
  });

  it('marks an unknown security type as unknown', () => {
    expect(parseWifi('WIFI:T:WPA3X;S:Net;P:x;;')).toMatchObject({ security: 'unknown' });
  });

  it('falls back to text when the SSID is missing', () => {
    expect(classify('WIFI:T:WPA;P:pw;;')).toEqual({ kind: 'text', text: 'WIFI:T:WPA;P:pw;;' });
  });
});

describe('contact parsing', () => {
  it('parses a vCard with folded lines, escapes and parameters', () => {
    const card = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\n Lovelace\r\nTEL;TYPE=CELL:+44 20 7946 0000\r\nEMAIL:ada@example.org\r\nORG:Analytical;Engines\r\nURL:https://example.org\r\nEND:VCARD';
    expect(parseContact(card)).toEqual({
      kind: 'contact',
      rows: [
        { label: 'Name', value: 'AdaLovelace' },
        { label: 'Phone', value: '+44 20 7946 0000' },
        { label: 'Email', value: 'ada@example.org' },
        { label: 'Organization', value: 'Analytical Engines' },
        { label: 'Website', value: 'https://example.org' },
      ],
    });
  });

  it('round-trips a generated vCard', () => {
    const payload = vcardPayload({ kind: 'vcard', name: 'Ada, L.', phone: '+1 555', email: 'a@b.co', org: '', url: '' });
    expect(classify(payload)).toEqual({
      kind: 'contact',
      rows: [
        { label: 'Name', value: 'Ada, L.' },
        { label: 'Phone', value: '+1 555' },
        { label: 'Email', value: 'a@b.co' },
      ],
    });
  });

  it('parses a MECARD with Last,First names', () => {
    expect(parseContact('MECARD:N:Lovelace,Ada;TEL:5550100;EMAIL:ada@example.org;;')).toEqual({
      kind: 'contact',
      rows: [
        { label: 'Name', value: 'Ada Lovelace' },
        { label: 'Phone', value: '5550100' },
        { label: 'Email', value: 'ada@example.org' },
      ],
    });
  });
});

describe('address-like codes', () => {
  it('parses mailto with percent-encoded subject and body', () => {
    expect(parseAddress('mailto:ada@example.com?subject=Hi%20there&body=Line%201%0ALine%202')).toEqual({
      kind: 'address',
      scheme: 'mailto',
      rows: [
        { label: 'Email', value: 'ada@example.com' },
        { label: 'Subject', value: 'Hi there' },
        { label: 'Body', value: 'Line 1\nLine 2' },
      ],
    });
  });

  it('parses tel and SMS', () => {
    expect(classify('tel:+15550100')).toEqual({ kind: 'address', scheme: 'tel', rows: [{ label: 'Phone', value: '+15550100' }] });
    expect(classify(payloadFor({ kind: 'sms', number: '+1 555 0100', message: 'On my way: 5 min' })!)).toEqual({
      kind: 'address',
      scheme: 'sms',
      rows: [
        { label: 'Phone', value: '+15550100' },
        { label: 'Message', value: 'On my way: 5 min' },
      ],
    });
  });
});

describe('plain text and splitting', () => {
  it('shows any other text as text', () => {
    expect(classify('  hello there  ')).toEqual({ kind: 'text', text: '  hello there  ' });
  });

  it('keeps escapes when splitting on unescaped separators', () => {
    expect(splitRaw('a\\;b;c', ';')).toEqual(['a\\;b', 'c']);
  });
});
