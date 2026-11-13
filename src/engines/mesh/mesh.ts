import { ToolError } from '@/lib/errors';

// Triangle-mesh conversion between OBJ, STL and PLY. Geometry only: positions and triangles.
// Colours, normals, texture coordinates, materials, groups and units are NOT carried over.
export type Mesh = { positions: Float32Array; indices: Uint32Array };
export type MeshFormat = 'obj' | 'stl' | 'ply';
export type MeshStats = { vertices: number; triangles: number; min: [number, number, number]; max: [number, number, number] };

const bad = (what: string) => new ToolError('mesh-parse', `This ${what} file could not be read.`, 'Check that it is a triangle or polygon mesh in OBJ, STL or PLY format.');
const MAX_TRIANGLES = 5_000_000;

export function stats(m: Mesh): MeshStats {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = m.positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  return { vertices: m.positions.length / 3, triangles: m.indices.length / 3, min, max };
}

function finish(pos: number[], idx: number[], what: string): Mesh {
  const n = pos.length / 3;
  if (n === 0 || idx.length === 0 || idx.length % 3 !== 0) throw bad(what);
  if (idx.length / 3 > MAX_TRIANGLES) throw new ToolError('mesh-too-large', 'This mesh has more than 5 million triangles.', 'Simplify it in a 3D program first.');
  for (const i of idx) if (!(i >= 0 && i < n)) throw bad(what);
  for (const p of pos) if (!Number.isFinite(p)) throw bad(what);
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

export function parseObj(text: string): Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  const tooMany = () => new ToolError('mesh-too-large', 'This mesh has more than 5 million triangles.', 'Simplify it in a 3D program first.');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      pos.push(Number(p[1]), Number(p[2]), Number(p[3]));
    } else if (line.startsWith('f ')) {
      const n = pos.length / 3;
      // "f v/vt/vn ..." with 1-based or negative (relative) indices; polygons are fan-triangulated.
      const f = line.split(/\s+/).slice(1).map((t) => {
        const i = parseInt(t.split('/')[0]!, 10);
        return i < 0 ? n + i : i - 1;
      });
      for (let i = 1; i + 1 < f.length; i++) idx.push(f[0]!, f[i]!, f[i + 1]!);
      if (idx.length > MAX_TRIANGLES * 3) throw tooMany();
    }
  }
  return finish(pos, idx, 'OBJ');
}

function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return false;
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  return bytes.length === 84 + count * 50;
}

export function parseStl(bytes: Uint8Array): Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  if (isBinaryStl(bytes)) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = dv.getUint32(80, true);
    if (count > MAX_TRIANGLES) throw new ToolError('mesh-too-large', 'This mesh has more than 5 million triangles.', 'Simplify it in a 3D program first.');
    for (let t = 0; t < count; t++) {
      const o = 84 + t * 50 + 12;
      for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) pos.push(dv.getFloat32(o + v * 12 + k * 4, true));
      idx.push(t * 3, t * 3 + 1, t * 3 + 2);
    }
  } else {
    const text = new TextDecoder().decode(bytes);
    if (!/^\s*solid/.test(text)) throw bad('STL');
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) pos.push(Number(m[1]), Number(m[2]), Number(m[3]));
    for (let i = 0; i < pos.length / 3; i++) idx.push(i);
  }
  return finish(pos, idx, 'STL');
}

const PLY_SIZE: Record<string, number> = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
function plyRead(dv: DataView, o: number, type: string, le: boolean): number {
  switch (type) {
    case 'char': case 'int8': return dv.getInt8(o);
    case 'uchar': case 'uint8': return dv.getUint8(o);
    case 'short': case 'int16': return dv.getInt16(o, le);
    case 'ushort': case 'uint16': return dv.getUint16(o, le);
    case 'int': case 'int32': return dv.getInt32(o, le);
    case 'uint': case 'uint32': return dv.getUint32(o, le);
    case 'float': case 'float32': return dv.getFloat32(o, le);
    case 'double': case 'float64': return dv.getFloat64(o, le);
    default: throw bad('PLY');
  }
}

export function parsePly(bytes: Uint8Array): Mesh {
  const headEnd = (() => {
    const marker = new TextEncoder().encode('end_header');
    outer: for (let i = 0; i < Math.min(bytes.length, 65536); i++) {
      for (let j = 0; j < marker.length; j++) if (bytes[i + j] !== marker[j]) continue outer;
      let e = i + marker.length;
      if (bytes[e] === 13) e++;
      return e + 1;
    }
    return -1;
  })();
  if (headEnd < 0) throw bad('PLY');
  const header = new TextDecoder().decode(bytes.subarray(0, headEnd)).split(/\r?\n/);
  if (header[0]?.trim() !== 'ply') throw bad('PLY');
  let format = '';
  type Prop = { name: string; type: string; list?: { count: string; item: string } };
  const elements: { name: string; count: number; props: Prop[] }[] = [];
  for (const l of header) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'format') format = p[1] ?? '';
    else if (p[0] === 'element') elements.push({ name: p[1]!, count: Number(p[2]), props: [] });
    else if (p[0] === 'property') {
      const el = elements[elements.length - 1];
      if (!el) throw bad('PLY');
      el.props.push(p[1] === 'list' ? { name: p[4]!, type: 'list', list: { count: p[2]!, item: p[3]! } } : { name: p[2]!, type: p[1]! });
    }
  }
  // A header can claim any element count. Each element needs at least one byte, so a count beyond the data is a lie.
  const body = bytes.length - headEnd;
  for (const el of elements) if (!(el.count >= 0) || el.count > body) throw bad('PLY');
  const pos: number[] = [];
  const idx: number[] = [];
  const addFace = (f: number[]) => {
    for (let i = 1; i + 1 < f.length; i++) idx.push(f[0]!, f[i]!, f[i + 1]!);
  };
  if (format === 'ascii') {
    const lines = new TextDecoder().decode(bytes.subarray(headEnd)).split(/\r?\n/).filter((l) => l.trim());
    let li = 0;
    for (const el of elements)
      for (let n = 0; n < el.count; n++) {
        const t = (lines[li++] ?? '').trim().split(/\s+/).map(Number);
        if (el.name === 'vertex') {
          const g = (name: string) => t[el.props.findIndex((p) => p.name === name)] ?? NaN;
          pos.push(g('x'), g('y'), g('z'));
        } else if (el.name === 'face') addFace(t.slice(1, 1 + (t[0] ?? 0)));
      }
  } else if (format === 'binary_little_endian' || format === 'binary_big_endian') {
    const le = format === 'binary_little_endian';
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = headEnd;
    for (const el of elements)
      for (let n = 0; n < el.count; n++) {
        const row: Record<string, number> = {};
        for (const p of el.props) {
          if (p.list) {
            const c = plyRead(dv, o, p.list.count, le);
            o += PLY_SIZE[p.list.count] ?? 0;
            const items: number[] = [];
            for (let i = 0; i < c; i++) {
              items.push(plyRead(dv, o, p.list.item, le));
              o += PLY_SIZE[p.list.item] ?? 0;
            }
            if (el.name === 'face' && (p.name === 'vertex_indices' || p.name === 'vertex_index')) addFace(items);
          } else {
            row[p.name] = plyRead(dv, o, p.type, le);
            o += PLY_SIZE[p.type] ?? 0;
          }
        }
        if (el.name === 'vertex') pos.push(row.x ?? NaN, row.y ?? NaN, row.z ?? NaN);
      }
  } else throw bad('PLY');
  return finish(pos, idx, 'PLY');
}

/** Detect by content first, then by extension. */
export function detectFormat(name: string, bytes: Uint8Array): MeshFormat | null {
  const head = new TextDecoder().decode(bytes.subarray(0, 16));
  if (head.startsWith('ply')) return 'ply';
  if (isBinaryStl(bytes) || /^\s*solid\s/.test(head)) return 'stl';
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'obj') return 'obj';
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  return null;
}

export function parseMesh(format: MeshFormat, bytes: Uint8Array): Mesh {
  try {
    return format === 'obj' ? parseObj(new TextDecoder().decode(bytes)) : format === 'stl' ? parseStl(bytes) : parsePly(bytes);
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw bad(format.toUpperCase());
  }
}

export function writeObj(m: Mesh): Uint8Array {
  const out: string[] = ['# Exported by Plainkit: geometry only'];
  for (let i = 0; i < m.positions.length; i += 3) out.push(`v ${m.positions[i]} ${m.positions[i + 1]} ${m.positions[i + 2]}`);
  for (let i = 0; i < m.indices.length; i += 3) out.push(`f ${m.indices[i]! + 1} ${m.indices[i + 1]! + 1} ${m.indices[i + 2]! + 1}`);
  return new TextEncoder().encode(out.join('\n') + '\n');
}

export function writeStl(m: Mesh): Uint8Array {
  const tris = m.indices.length / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  new Uint8Array(buf).set(new TextEncoder().encode('Binary STL exported by Plainkit'), 0);
  dv.setUint32(80, tris, true);
  const p = m.positions;
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = [m.indices[t * 3]! * 3, m.indices[t * 3 + 1]! * 3, m.indices[t * 3 + 2]! * 3];
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const o = 84 + t * 50;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    [a, b, c].forEach((v, i) => {
      for (let k = 0; k < 3; k++) dv.setFloat32(o + 12 + i * 12 + k * 4, p[v + k]!, true);
    });
  }
  return new Uint8Array(buf);
}

export function writePly(m: Mesh): Uint8Array {
  const verts = m.positions.length / 3;
  const tris = m.indices.length / 3;
  const header = new TextEncoder().encode(
    `ply\nformat binary_little_endian 1.0\ncomment Exported by Plainkit: geometry only\nelement vertex ${verts}\nproperty float x\nproperty float y\nproperty float z\nelement face ${tris}\nproperty list uchar int vertex_indices\nend_header\n`,
  );
  const buf = new Uint8Array(header.length + verts * 12 + tris * 13);
  buf.set(header, 0);
  const dv = new DataView(buf.buffer);
  let o = header.length;
  for (let i = 0; i < m.positions.length; i++, o += 4) dv.setFloat32(o, m.positions[i]!, true);
  for (let t = 0; t < tris; t++) {
    dv.setUint8(o, 3);
    for (let k = 0; k < 3; k++) dv.setInt32(o + 1 + k * 4, m.indices[t * 3 + k]!, true);
    o += 13;
  }
  return buf;
}

export const MESH_MIME: Record<MeshFormat, string> = { obj: 'model/obj', stl: 'model/stl', ply: 'model/ply' };
export function writeMesh(format: MeshFormat, m: Mesh): Uint8Array {
  return format === 'obj' ? writeObj(m) : format === 'stl' ? writeStl(m) : writePly(m);
}

/** Convert and verify by re-reading the output: triangle count and bounding box must match. */
export function convertMesh(name: string, bytes: Uint8Array, to: MeshFormat): { bytes: Uint8Array; from: MeshFormat; stats: MeshStats } {
  const from = detectFormat(name, bytes);
  if (!from) throw new ToolError('mesh-unknown', 'This is not an OBJ, STL or PLY file.', 'glTF, GLB, FBX, 3MF, STEP and CAD formats are not supported.');
  const mesh = parseMesh(from, bytes);
  const out = writeMesh(to, mesh);
  const a = stats(mesh);
  const b = stats(parseMesh(to, out));
  const close = (x: number, y: number) => Math.abs(x - y) <= 1e-4 * Math.max(1, Math.abs(x), Math.abs(y));
  if (a.triangles !== b.triangles || !a.min.every((v, i) => close(v, b.min[i]!)) || !a.max.every((v, i) => close(v, b.max[i]!)))
    throw new ToolError('mesh-verify', 'The converted file did not match the original when read back.', 'Try another output format.');
  return { bytes: out, from, stats: a };
}
