import type { ReactNode } from 'react';
import { mustTool } from '@/registry';
import './components.css';

/** Standard tool layout: heading, main working area, optional settings panel, limitations. */
export function ToolPage({ toolId, settings, children }: { toolId: string; settings?: ReactNode; children: ReactNode }) {
  const tool = mustTool(toolId);
  return (
    <div className="pk-tool">
      <header className="pk-tool__head">
        <h1>{tool.title}</h1>
        <p>{tool.description}</p>
      </header>
      <div className={`pk-tool__body${settings ? ' pk-tool__body--settings' : ''}`}>
        <div className="pk-tool__main">{children}</div>
        {settings && (
          <aside className="pk-tool__settings" aria-label={`${tool.name} settings`}>
            {settings}
          </aside>
        )}
      </div>
      {tool.limitations.length > 0 && (
        <details className="pk-limits">
          <summary>Limits of this tool</summary>
          <ul>
            {tool.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
