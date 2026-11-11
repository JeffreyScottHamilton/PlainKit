import { lazy, Suspense, useMemo } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { TOOLS, getTool } from '@/registry';

// Placeholder shell. Replaced by the real Nightshift shell (sidebar, top bar, tray, drawer).
function ToolRoute() {
  const { id = '' } = useParams();
  const tool = getTool(id);
  const Comp = useMemo(() => (tool ? lazy(tool.load) : null), [tool]);
  if (!tool || !Comp) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Loading {tool.name}…</p>}>
      <Comp />
    </Suspense>
  );
}

export function App() {
  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      <nav aria-label="Tools" style={{ width: 224, padding: 16 }}>
        <Link to="/">Home</Link>
        <ul>{TOOLS.map((t) => <li key={t.id}><Link to={`/tools/${t.id}`}>{t.name}</Link></li>)}</ul>
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>
        <Routes>
          <Route path="/" element={<h1 style={{ padding: 24 }}>Workspace</h1>} />
          <Route path="/tools/:id" element={<ToolRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
