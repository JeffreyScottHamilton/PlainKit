import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, Settings, Star } from 'lucide-react';
import { TOOLS, searchTools } from '@/registry';
import { BRAND } from './brand';
import { toggleFavorite, usePrefs } from './prefs';

function Mark() {
  return (
    <svg className="side__mark" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 2h16v8H10v8H2z" fill="currentColor" />
    </svg>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'side__link is-active' : 'side__link');

/** Flat list of all tools in registry order. Used in the desktop sidebar and the mobile drawer. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState('');
  const { favorites } = usePrefs();
  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return TOOLS;
    const hits = new Set(searchTools(q).map((t) => t.id));
    return TOOLS.filter((t) => hits.has(t.id));
  }, [query]);
  const fav = new Set(favorites);

  return (
    <div className="side">
      <div className="side__brand">
        <Mark />
        <span>{BRAND.wordmark}</span>
      </div>
      <div className="side__search">
        <Search aria-hidden="true" />
        <input type="search" aria-label="Find a tool" placeholder="Find a tool…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <nav aria-label="Tools" className="side__nav">
        {visible.length === 0 ? (
          <p className="side__empty">No tool matches “{query.trim()}”.</p>
        ) : (
          <ul>
            {visible.map((t) => {
              const on = fav.has(t.id);
              return (
                <li key={t.id}>
                  <div className="side__row">
                    <NavLink to={`/tools/${t.id}`} className={linkClass} onClick={onNavigate}>
                      <t.icon aria-hidden="true" />
                      <span>{t.name}</span>
                    </NavLink>
                    <button
                      type="button"
                      className="star"
                      aria-pressed={on}
                      aria-label={`${on ? 'Remove' : 'Add'} ${t.name} ${on ? 'from' : 'to'} favorites`}
                      onClick={() => toggleFavorite(t.id)}
                    >
                      <Star aria-hidden="true" fill={on ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <div className="side__foot">
        <NavLink to="/settings" className={linkClass} onClick={onNavigate}>
          <Settings aria-hidden="true" />
          <span>Settings</span>
        </NavLink>
        <p className="side__free">{BRAND.free}</p>
      </div>
    </div>
  );
}
