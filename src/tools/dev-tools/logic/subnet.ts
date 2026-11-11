export type SubnetInfo = {
  network: string;
  broadcast: string;
  netmask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  hostCount: number;
  totalAddresses: number;
  note?: string;
};
export type SubnetResult = { ok: true; info: SubnetInfo } | { ok: false; error: string };

const toInt = (ip: string): number => ip.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
const toIp = (n: number): string => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

/** IPv4 only. IPv6 is not supported. /31 gives 2 hosts (RFC 3021). /32 gives one host route. */
export function subnet(input: string): SubnetResult {
  const m = /^\s*(\S+?)\s*\/\s*(\d{1,2})\s*$/.exec(input);
  if (!m) return { ok: false, error: 'Use IPv4 CIDR notation with a prefix, such as 192.168.1.10/24.' };
  const octets = m[1]!.split('.');
  if (octets.length !== 4 || !octets.every((o) => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255)) {
    if (m[1]!.includes(':')) return { ok: false, error: 'IPv6 is not supported. Enter an IPv4 address such as 10.0.0.1/8.' };
    return { ok: false, error: `"${m[1]}" is not a valid IPv4 address. Each part must be 0 to 255.` };
  }
  const prefix = Number(m[2]);
  if (prefix > 32) return { ok: false, error: 'The prefix must be between 0 and 32.' };
  const ip = toInt(m[1]!);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  let first = network;
  let last = broadcast;
  let hosts = total;
  let note: string | undefined;
  if (prefix === 32) {
    note = 'A /32 is a single host route; the address is both first and last.';
  } else if (prefix === 31) {
    note = 'A /31 is a point-to-point link with two addresses (RFC 3021). Neither is a broadcast.';
    hosts = 2;
  } else {
    first = network + 1;
    last = broadcast - 1;
    hosts = total - 2;
  }
  return {
    ok: true,
    info: {
      network: toIp(network),
      broadcast: toIp(broadcast),
      netmask: toIp(mask),
      wildcard: toIp(~mask >>> 0),
      firstHost: toIp(first),
      lastHost: toIp(last),
      hostCount: hosts,
      totalAddresses: total,
      note,
    },
  };
}
