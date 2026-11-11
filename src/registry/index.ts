import { TOOLS } from './tools';
import type { NetworkMode, ToolDef } from './types';

export { TOOLS, HOME_DIRECTORY } from './tools';
export type { ToolDef, NetworkMode, Maturity } from './types';

const byId = new Map(TOOLS.map((t) => [t.id, t]));
export function getTool(id: string): ToolDef | undefined {
  return byId.get(id);
}
export function mustTool(id: string): ToolDef {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown tool: ${id}`);
  return t;
}

export function mimeMatches(mime: string, pattern: string): boolean {
  if (pattern === '*/*') return true;
  return pattern.endsWith('/*') ? mime.startsWith(pattern.slice(0, -1)) : mime === pattern;
}
export function accepts(tool: ToolDef, mime: string): boolean {
  return tool.accepts.some((p) => mimeMatches(mime, p));
}
/** Tools that can genuinely take this file. The catch-all Send files is listed last. */
export function toolsFor(mime: string): ToolDef[] {
  const hits = TOOLS.filter((t) => accepts(t, mime));
  return [...hits.filter((t) => !t.accepts.includes('*/*')), ...hits.filter((t) => t.accepts.includes('*/*'))];
}

/** Search by name, task keywords and old reference names. */
export function searchTools(query: string): ToolDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;
  const score = (t: ToolDef) => {
    const name = t.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(q) || t.title.toLowerCase().includes(q)) return 1;
    if (t.aliases.some((a) => a.toLowerCase().includes(q))) return 2;
    if (t.keywords.some((k) => k.includes(q))) return 3;
    if (t.description.toLowerCase().includes(q)) return 4;
    return -1;
  };
  return TOOLS.map((t) => [t, score(t)] as const).filter(([, s]) => s >= 0).sort((a, b) => a[1] - b[1]).map(([t]) => t);
}

export const NETWORK_LABEL: Record<NetworkMode, string> = {
  'on-device': 'On this device',
  peer: 'Connects to another device',
  network: 'Needs network access',
};
