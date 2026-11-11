export type TsOutcome = { ok: true; text: string } | { ok: false; message: string };

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED = new Set(['break', 'case', 'class', 'const', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pascal(raw: string): string {
  const parts = raw.split(/[^A-Za-z0-9]+/).filter((p) => p !== '');
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  if (name === '') return 'Item';
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

function singular(key: string): string {
  return key.length > 1 && key.endsWith('s') && !key.endsWith('ss') ? key.slice(0, -1) : key;
}

function propKey(key: string): string {
  return IDENT.test(key) && !RESERVED.has(key) ? key : JSON.stringify(key);
}

type Ctx = { decls: string[]; used: Set<string> };

function uniqueName(ctx: Ctx, base: string): string {
  let name = base;
  for (let n = 2; ctx.used.has(name); n++) name = `${base}${n}`;
  ctx.used.add(name);
  return name;
}

/** Type string for a set of values seen at the same position (a key across objects, or array items). */
function typeOfValues(values: unknown[], hint: string, ctx: Ctx): string {
  const parts: string[] = [];
  const add = (p: string) => {
    if (!parts.includes(p)) parts.push(p);
  };
  const objects = values.filter(isPlainObject);
  const arrays = values.filter(Array.isArray);
  const prims = values.filter((v) => !isPlainObject(v) && !Array.isArray(v));
  if (objects.length > 0) add(interfaceFor(objects, hint, ctx));
  if (arrays.length > 0) {
    const items = arrays.flat();
    const elem = items.length === 0 ? 'unknown' : typeOfValues(items, singular(hint), ctx);
    add(elem.includes(' | ') ? `(${elem})[]` : `${elem}[]`);
  }
  for (const p of prims) add(primType(p));
  return parts.length === 0 ? 'unknown' : parts.join(' | ');
}

function primType(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'unknown';
}

/** Builds one interface from one or more objects. Keys missing from some objects become optional. */
function interfaceFor(objects: Record<string, unknown>[], hint: string, ctx: Ctx, forced?: string): string {
  const name = forced ?? uniqueName(ctx, pascal(hint));
  const idx = ctx.decls.length;
  ctx.decls.push('');
  const keys: string[] = [];
  for (const o of objects) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
  const lines = keys.map((k) => {
    const present = objects.filter((o) => Object.prototype.hasOwnProperty.call(o, k));
    const t = typeOfValues(present.map((o) => o[k]), k, ctx);
    const optional = present.length < objects.length ? '?' : '';
    return `  ${propKey(k)}${optional}: ${t};`;
  });
  ctx.decls[idx] = lines.length === 0 ? `export interface ${name} {}` : `export interface ${name} {\n${lines.join('\n')}\n}`;
  return name;
}

export function jsonToTs(src: string, rootName: string): TsOutcome {
  if (src.trim() === '') return { ok: false, message: 'Paste some JSON first.' };
  const root = rootName.trim() || 'Root';
  if (!IDENT.test(root)) return { ok: false, message: `Root name "${root}" is not a valid TypeScript identifier.` };
  let value: unknown;
  try {
    value = JSON.parse(src);
  } catch (e) {
    return { ok: false, message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const ctx: Ctx = { decls: [], used: new Set([root]) };
  if (isPlainObject(value)) {
    interfaceFor([value], root, ctx, root);
  } else {
    const idx = ctx.decls.length;
    ctx.decls.push('');
    const t = typeOfValues([value], root, ctx);
    ctx.decls[idx] = `export type ${root} = ${t};`;
  }
  return { ok: true, text: ctx.decls.join('\n\n') };
}
