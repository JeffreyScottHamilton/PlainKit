import { useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Monitor, Search, Share2, Globe, type LucideIcon } from 'lucide-react';
import { getTool, NETWORK_LABEL, type NetworkMode } from '@/registry';
import { BRAND } from './brand';
import { isTheme, setTheme, usePrefs } from './prefs';

const MODE_ICON: Record<NetworkMode, LucideIcon> = { 'on-device': Monitor, peer: Share2, network: Globe };
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Labeled theme control. Visible label, real select. */
export function ThemeSelect() {
  const id = useId();
  const { theme } = usePrefs();
  return (
    <div className="theme">
      <label htmlFor={id}>Theme</label>
      <select id={id} className="pk-select theme__select" value={theme} onChange={(e) => isTheme(e.target.value) && setTheme(e.target.value)}>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </div>
  );
}

type Props = { menuOpen: boolean; onOpenMenu: () => void; onOpenSearch: () => void };

export function TopBar({ menuOpen, onOpenMenu, onOpenSearch }: Props) {
  const { pathname } = useLocation();
  const toolId = /^\/tools\/([^/]+)$/.exec(pathname)?.[1];
  const tool = toolId ? getTool(toolId) : undefined;
  const settings = pathname === '/settings';
  const onTool = tool !== undefined;
  const mode = tool ? { label: tool.networkNote ? `${NETWORK_LABEL[tool.network]}; ${tool.networkNote}` : NETWORK_LABEL[tool.network], Icon: MODE_ICON[tool.network] } : { label: NETWORK_LABEL['on-device'], Icon: Monitor };
  const shortcut = isMac ? '⌘K' : 'Ctrl K';

  return (
    <header className="topbar">
      <button type="button" className="topbar__menu" aria-label="Open tools menu" aria-expanded={menuOpen} aria-controls="tools-drawer" onClick={onOpenMenu}>
        <Menu aria-hidden="true" />
      </button>
      <span className="topbar__brand">{BRAND.wordmark}</span>
      <nav aria-label="Breadcrumb" className="crumbs">
        <ol className={onTool ? 'crumbs--tool' : undefined}>
          <li>
            {onTool || settings ? (
              <Link to="/">Workspace</Link>
            ) : (
              <span aria-current="page">Workspace</span>
            )}
          </li>
          {tool && (
            <li>
              <span className="crumbs__sep" aria-hidden="true">/</span>
              <span aria-current="page">{tool.title}</span>
            </li>
          )}
          {settings && (
            <li>
              <span className="crumbs__sep" aria-hidden="true">/</span>
              <span aria-current="page">Settings</span>
            </li>
          )}
        </ol>
      </nav>
      <div className="topbar__right">
        <span className="mode" title={mode.label}>
          <mode.Icon aria-hidden="true" />
          <span className="mode__text">{mode.label}</span>
        </span>
        <button type="button" className="topbar__search" onClick={onOpenSearch}>
          <Search aria-hidden="true" />
          <span className="topbar__search-text">Search tools</span>
          <kbd className="kbd" aria-hidden="true">
            {shortcut}
          </kbd>
        </button>
        <ThemeSelect />
      </div>
    </header>
  );
}
