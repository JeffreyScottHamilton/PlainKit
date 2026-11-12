import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DropZone } from '@/components/DropZone';
import { HOME_DIRECTORY, TOOLS, getTool, type ToolDef } from '@/registry';
import { BRAND } from './brand';
import { usePrefs } from './prefs';

function ToolRow({ tool }: { tool: ToolDef }) {
  return (
    <Link to={`/tools/${tool.id}`} className="row-link">
      <tool.icon aria-hidden="true" />
      <span className="row-link__text">
        <span className="row-link__name">{tool.name}</span>
        <span className="row-link__desc">{tool.description}</span>
      </span>
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

export function Home() {
  const { favorites, recents } = usePrefs();
  const favs = TOOLS.filter((t) => favorites.includes(t.id));
  const recent = recents.flatMap((id) => TOOLS.find((t) => t.id === id) ?? []).filter((t) => !favorites.includes(t.id));
  const [left, right] = HOME_DIRECTORY.map((col) => col.flatMap((id) => getTool(id) ?? []));

  return (
    <div className="page">
      <header className="page-head">
        <h1>{BRAND.homeHeading}</h1>
        <p>{BRAND.tagline}</p>
      </header>

      <DropZone />

      {favs.length > 0 && (
        <section aria-labelledby="home-fav">
          <h2 id="home-fav" className="section-h">
            Favorites
          </h2>
          <ul className="row-list">
            {favs.map((t) => (
              <li key={t.id}>
                <ToolRow tool={t} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="home-recent">
          <h2 id="home-recent" className="section-h">
            Recent
          </h2>
          <ul className="row-list">
            {recent.map((t) => (
              <li key={t.id}>
                <ToolRow tool={t} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="home-tools">
        <h2 id="home-tools" className="section-h">
          Everyday tools
        </h2>
        <div className="dir">
          <ul className="row-list">
            {left?.map((t) => (
              <li key={t.id}>
                <ToolRow tool={t} />
              </li>
            ))}
          </ul>
          <ul className="row-list">
            {right?.map((t) => (
              <li key={t.id}>
                <ToolRow tool={t} />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
