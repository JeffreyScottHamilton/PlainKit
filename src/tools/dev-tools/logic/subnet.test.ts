import { describe, expect, it } from 'vitest';
import { subnet } from './subnet';

const info = (s: string) => {
  const r = subnet(s);
  if (!r.ok) throw new Error(r.error);
  return r.info;
};

describe('subnet calculator', () => {
  it('computes a /24 network, broadcast, and host range', () => {
    const i = info('192.168.1.10/24');
    expect(i).toMatchObject({
      network: '192.168.1.0',
      broadcast: '192.168.1.255',
      netmask: '255.255.255.0',
      wildcard: '0.0.0.255',
      firstHost: '192.168.1.1',
      lastHost: '192.168.1.254',
      hostCount: 254,
      totalAddresses: 256,
    });
  });

  it('handles /31 as two hosts and /32 as one host', () => {
    expect(info('10.0.0.1/31')).toMatchObject({ network: '10.0.0.0', firstHost: '10.0.0.0', lastHost: '10.0.0.1', hostCount: 2 });
    expect(info('10.1.2.3/32')).toMatchObject({ firstHost: '10.1.2.3', lastHost: '10.1.2.3', hostCount: 1 });
  });

  it('reports invalid input and IPv6 as errors', () => {
    expect(subnet('192.168.1.256/24')).toEqual({ ok: false, error: '"192.168.1.256" is not a valid IPv4 address. Each part must be 0 to 255.' });
    expect(subnet('192.168.1.1/33').ok).toBe(false);
    expect(subnet('192.168.1.1')).toEqual({ ok: false, error: 'Use IPv4 CIDR notation with a prefix, such as 192.168.1.10/24.' });
    const v6 = subnet('2001:db8::1/64');
    expect(v6.ok).toBe(false);
    if (!v6.ok) expect(v6.error).toMatch(/IPv6 is not supported/);
  });
});
