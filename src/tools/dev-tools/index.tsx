import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ToolPage } from '@/components/ToolPage';
import { Field } from '@/components/ui';
import { UTILS } from './catalog';
import './dev-tools.css';

export default function DevTools() {
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const current = UTILS.find((u) => u.id === params.get('u')) ?? UTILS[0]!;
  const Comp = useMemo(() => lazy(current.load), [current]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? UTILS.filter((u) => `${u.name} ${u.keywords} ${u.id}`.toLowerCase().includes(s)) : UTILS;
  }, [q]);
  return (
    <ToolPage toolId="dev-tools">
      <div className="dev">
        <nav className="dev__list" aria-label="Utilities">
          <Field label="Find a utility">{(a) => <input {...a} className="pk-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
          <ul>
            {shown.map((u) => (
              <li key={u.id}>
                <Link to={`?u=${u.id}`} aria-current={u.id === current.id ? 'page' : undefined}>
                  {u.name}
                </Link>
              </li>
            ))}
            {shown.length === 0 && <li className="muted" style={{ padding: 8 }}>No utility matches.</li>}
          </ul>
        </nav>
        <section className="dev__work" aria-labelledby="dev-util-h">
          <h2 id="dev-util-h">{current.name}</h2>
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <Comp />
          </Suspense>
        </section>
      </div>
    </ToolPage>
  );
}
