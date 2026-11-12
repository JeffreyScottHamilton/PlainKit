import { useMemo, type ReactNode } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { JobResult } from '@/components/JobResult';
import { isMesh } from '@/components/KindTabs';
import { Button, Field, Notice } from '@/components/ui';
import { removeAsset, removeInput, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import { ToolError } from '@/lib/errors';
import { formatBytes, outputName } from '@/lib/format';
import { MESH_MIME, convertMesh, type MeshFormat } from '@/engines/mesh/mesh';

const ACCEPT = '.obj,.stl,.ply';
const MAX = 150 * 1024 * 1024;
type State = { to: MeshFormat; jobByInput: Record<string, string> };

export function MeshConvert({ tabs }: { tabs?: ReactNode }) {
  const all = useToolInputs('convert');
  const inputs = useMemo(() => all.filter(isMesh), [all]);
  const jobs = useJobs('convert');
  const [st, set] = useToolState<State>('convert:mesh', { to: 'stl', jobByInput: {} });

  const run = () => {
    const next = { ...st.jobByInput };
    for (const a of inputs) {
      const prev = jobs.find((j) => j.id === next[a.id]);
      if (prev && isActive(prev)) cancelJob(prev.id);
      prev?.result?.assets.forEach((x) => removeAsset(x.id));
      next[a.id] = enqueue({
        toolId: 'convert',
        label: `Convert ${a.name}`,
        inputIds: [a.id],
        heavy: true,
        // shortcut: parsed on the main thread, so a very large mesh freezes the page briefly; move to a worker if that shows up.
        run: async () => {
          if (a.size > MAX) throw new ToolError('too-large', 'This file is larger than 150 MB.', 'Simplify the model in a 3D program first.');
          const r = convertMesh(a.name, new Uint8Array(await a.blob.arrayBuffer()), st.to);
          const s = r.stats;
          const size = s.max.map((v, i) => +(v - s.min[i]!).toPrecision(6)).join(' × ');
          return {
            outputs: [{ name: outputName(a.name, 'converted', st.to), mime: MESH_MIME[st.to], blob: new Blob([r.bytes as BlobPart], { type: MESH_MIME[st.to] }) }],
            warnings: [`Verified by reading it back: ${s.triangles.toLocaleString('en')} triangles, ${s.vertices.toLocaleString('en')} vertices, bounding box ${size} (file units).`, `Read as ${r.from.toUpperCase()}. Geometry only: colours, normals, texture coordinates and materials are not carried over.`],
          };
        },
      });
    }
    set({ jobByInput: next });
  };

  return (
    <ToolPage
      toolId="convert"
      tabs={tabs}
      settings={
        <>
          <h2>3D model conversion</h2>
          <Field label="Output format">
            {(a) => (
              <select {...a} className="pk-select" value={st.to} onChange={(e) => set({ to: e.target.value as MeshFormat })}>
                <option value="stl">STL (binary)</option>
                <option value="obj">OBJ</option>
                <option value="ply">PLY (binary)</option>
              </select>
            )}
          </Field>
          <Button variant="primary" block disabled={inputs.length === 0} onClick={run}>
            {inputs.length > 1 ? `Convert ${inputs.length} files` : 'Convert'}
          </Button>
          <p className="pk-hint">Triangle meshes only. Polygons are split into triangles.</p>
        </>
      }
    >
      <Notice>
        Supported: OBJ, STL and PLY, in any direction. Only the shape is converted. glTF, GLB, FBX, 3MF, STEP and CAD formats are not supported.
      </Notice>
      {inputs.length === 0 ? (
        <DropZone toolId="convert" accept={ACCEPT} hint="3D files are processed in this browser." />
      ) : (
        <>
          {inputs.map((a) => (
            <article key={a.id} aria-label={a.name} className="pk-stack" style={{ gap: 8, borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
              <div className="pk-row" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="pk-asset__name" title={a.name}>{a.name}</div>
                  <div className="mono muted">{formatBytes(a.size)}</div>
                </div>
                <Button size="sm" variant="ghost" aria-label={`Remove ${a.name} from this tool`} onClick={() => removeInput('convert', a.id)}>
                  Remove
                </Button>
              </div>
              <JobResult job={jobs.find((j) => j.id === st.jobByInput[a.id])} source={a} exclude="convert" />
            </article>
          ))}
          <DropZone toolId="convert" compact accept={ACCEPT} />
        </>
      )}
    </ToolPage>
  );
}
