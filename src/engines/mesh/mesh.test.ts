import { describe, expect, it } from 'vitest';
import { convertMesh, detectFormat, parseMesh, parseObj, parsePly, parseStl, stats, writeObj, writePly, writeStl, type MeshFormat } from './mesh';

const TETRA = `# tetra
v 0 0 0
v 1 0 0
v 0 2 0
v 0 0 3
f 1 2 3
f 1/1/1 2/2/2 4/3/3
f -4 -2 -1
f 2 3 4
`;
const enc = (s: string) => new TextEncoder().encode(s);

describe('mesh', () => {
  it('parses OBJ with slashes and negative indices', () => {
    const m = parseObj(TETRA);
    expect(stats(m)).toEqual({ vertices: 4, triangles: 4, min: [0, 0, 0], max: [1, 2, 3] });
    expect([...m.indices.slice(6, 9)]).toEqual([0, 2, 3]);
  });
  it('fan-triangulates polygons', () => {
    const m = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n');
    expect(stats(m).triangles).toBe(2);
  });
  it('round-trips through every format pair', () => {
    const formats: MeshFormat[] = ['obj', 'stl', 'ply'];
    for (const a of formats)
      for (const b of formats) {
        const first = convertMesh('t.obj', enc(TETRA), a).bytes;
        const second = convertMesh(`t.${a}`, first, b);
        expect(second.from).toBe(a);
        expect(second.stats.triangles).toBe(4);
        expect(second.stats.max).toEqual([1, 2, 3]);
        expect(stats(parseMesh(b, second.bytes)).min).toEqual([0, 0, 0]);
      }
  });
  it('writes a valid binary STL length and reads ASCII STL', () => {
    const m = parseObj(TETRA);
    expect(writeStl(m).length).toBe(84 + 4 * 50);
    const ascii = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n';
    expect(stats(parseStl(enc(ascii))).triangles).toBe(1);
  });
  it('reads ASCII PLY with extra properties and quads', () => {
    const ply = 'ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0 255\n1 0 0 255\n1 1 0 255\n0 1 0 255\n4 0 1 2 3\n';
    expect(stats(parsePly(enc(ply)))).toMatchObject({ vertices: 4, triangles: 2 });
    expect(stats(parsePly(writePly(parseObj(TETRA)))).triangles).toBe(4);
  });
  it('detects by content, not just extension', () => {
    expect(detectFormat('x.obj', writePly(parseObj(TETRA)))).toBe('ply');
    expect(detectFormat('x.txt', writeStl(parseObj(TETRA)))).toBe('stl');
    expect(detectFormat('x.glb', enc('glTF'))).toBeNull();
    expect(new TextDecoder().decode(writeObj(parseObj(TETRA)))).toContain('f 1 2 3');
  });
  it('rejects junk, bad indices and unknown formats with a ToolError', () => {
    expect(() => convertMesh('x.obj', enc('hello'), 'stl')).toThrow(/could not be read/);
    expect(() => parseObj('v 0 0 0\nf 1 2 9\n')).toThrow(/could not be read/);
    expect(() => convertMesh('x.glb', enc('glTF....'), 'obj')).toThrow(/not an OBJ, STL or PLY/);
  });
});
