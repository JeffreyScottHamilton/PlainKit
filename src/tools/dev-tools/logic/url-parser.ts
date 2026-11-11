export type UrlParam = { key: string; value: string };
export type UrlParts = {
  href: string;
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  hash: string;
  params: UrlParam[];
};
export type UrlResult = { ok: true; parts: UrlParts } | { ok: false; error: string };

/** Parses with the WHATWG URL parser only. Never fetches. */
export function parseUrl(input: string): UrlResult {
  const s = input.trim();
  if (!s) return { ok: false, error: 'Enter a URL to parse.' };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'Not a valid absolute URL. Include a scheme such as https:// or mailto:.' };
  }
  return {
    ok: true,
    parts: {
      href: u.href,
      protocol: u.protocol,
      host: u.host,
      hostname: u.hostname,
      port: u.port,
      pathname: u.pathname,
      hash: u.hash,
      params: [...u.searchParams.entries()].map(([key, value]) => ({ key, value })),
    },
  };
}
