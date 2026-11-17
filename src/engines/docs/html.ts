// Tolerant HTML reader and a whitelist serializer. Pure: no DOM, so it runs in the worker.
// Scripts, styles, forms and embedded content are dropped with their children. Nothing parsed here is ever rendered.

export type Text = { t: 'text'; text: string };
export type Elem = { t: 'el'; tag: string; attrs: Record<string, string>; kids: Node[] };
export type Node = Text | Elem;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'svg', 'math', 'head', 'title', 'template', 'noscript', 'textarea', 'select', 'button', 'form', 'canvas', 'audio', 'video']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
// An opening tag closes an earlier sibling of these kinds, searching up to a scope boundary.
const CLOSES: Record<string, [string[], string[]]> = {
  li: [['li'], ['ul', 'ol']],
  dt: [['dt', 'dd'], ['dl']],
  dd: [['dt', 'dd'], ['dl']],
  td: [['td', 'th'], ['tr', 'table']],
  th: [['td', 'th'], ['tr', 'table']],
  tr: [['tr'], ['table', 'thead', 'tbody', 'tfoot']],
  thead: [['thead', 'tbody', 'tfoot'], ['table']],
  tbody: [['thead', 'tbody', 'tfoot'], ['table']],
  tfoot: [['thead', 'tbody', 'tfoot'], ['table']],
};

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', euro: '€', pound: '£', times: '×',
};

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR)) out[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** Parses HTML leniently. Unknown or unclosed markup never throws; the result is a tree of text and elements. */
export function parseHtml(src: string): Elem {
  const root: Elem = { t: 'el', tag: '#root', attrs: {}, kids: [] };
  const stack: Elem[] = [root];
  const top = () => stack[stack.length - 1]!;
  const closeTo = (names: string[], stop: string[]) => {
    for (let k = stack.length - 1; k > 0; k--) {
      const n = stack[k]!.tag;
      if (names.includes(n)) return void (stack.length = k);
      if (stop.includes(n)) return;
    }
  };
  let dropTag: string | null = null;
  const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const end = lt < 0 ? src.length : lt;
    if (end > i && !dropTag) top().kids.push({ t: 'text', text: decodeEntities(src.slice(i, end)) });
    if (lt < 0) break;
    i = lt;
    if (src.startsWith('<!--', i)) {
      const c = src.indexOf('-->', i + 4);
      i = c < 0 ? src.length : c + 3;
      continue;
    }
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const c = src.indexOf('>', i);
      i = c < 0 ? src.length : c + 1;
      continue;
    }
    TAG.lastIndex = i;
    const m = TAG.exec(src);
    if (!m) {
      if (!dropTag) top().kids.push({ t: 'text', text: '<' });
      i++;
      continue;
    }
    i = TAG.lastIndex;
    const closing = m[1] === '/';
    const tag = m[2]!.toLowerCase();
    if (dropTag) {
      if (closing && tag === dropTag) dropTag = null;
      continue;
    }
    if (!closing && DROP.has(tag)) {
      dropTag = tag;
      continue;
    }
    if (closing) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.tag === tag) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    if (tag === 'html' || tag === 'body') continue;
    const rule = CLOSES[tag];
    if (rule) closeTo(...rule);
    if (BLOCK.has(tag) && top().tag === 'p') stack.pop();
    const selfClosing = m[3]!.trimEnd().endsWith('/');
    const node: Elem = { t: 'el', tag, attrs: attrsOf(m[3]!), kids: [] };
    top().kids.push(node);
    if (!VOID.has(tag) && !selfClosing) stack.push(node);
  }
  return root;
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Tags kept in output; anything else is unwrapped so its text survives.
const ALLOWED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'a', 'br', 'hr', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'blockquote', 'pre', 'code', 'div', 'span', 'sup', 'sub', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'section', 'article', 'header', 'footer', 'main', 'caption', 'cite', 'small', 'mark']);
const VOID_OUT = new Set(['br', 'hr', 'img']);
const ATTRS_OUT: Record<string, string[]> = { a: ['href', 'title'], img: ['src', 'alt'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], ol: ['start'] };
const SAFE_HREF = /^(https?:|mailto:)/i;
const SAFE_SRC = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;

function outAttr(tag: string, name: string, v: string): string | null {
  if (!ATTRS_OUT[tag]?.includes(name)) return null;
  const val = v.trim();
  if (name === 'href' && !SAFE_HREF.test(val)) return null;
  if (name === 'src' && !SAFE_SRC.test(val.replace(/\s+/g, ''))) return null;
  if (name === 'start' || name === 'colspan' || name === 'rowspan') return /^\d{1,3}$/.test(val) ? val : null;
  return esc(name === 'src' ? val.replace(/\s+/g, '') : val);
}

/** Serializes a parsed tree keeping only whitelisted tags and attributes. Unsafe links and pictures are dropped. */
export function toSafeHtml(nodes: Node[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') {
      out += esc(n.text);
      continue;
    }
    if (!ALLOWED.has(n.tag)) {
      out += toSafeHtml(n.kids);
      continue;
    }
    const attrs = Object.entries(n.attrs)
      .map(([k, v]) => [k, outAttr(n.tag, k, v)] as const)
      .filter((p): p is readonly [string, string] => p[1] !== null)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
    if (n.tag === 'img' && !attrs.includes('src=')) continue;
    if (VOID_OUT.has(n.tag)) {
      out += `<${n.tag}${attrs}>`;
      continue;
    }
    out += `<${n.tag}${attrs}>${toSafeHtml(n.kids)}</${n.tag}>`;
  }
  return out;
}
