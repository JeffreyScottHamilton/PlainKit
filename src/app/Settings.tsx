import { Button, Segmented } from '@/components/ui';
import { TOOLS } from '@/registry';
import { ClearSessionButton } from './Tray';
import { removeFavorite, setTheme, usePrefs, type Theme } from './prefs';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export function Settings() {
  const { theme, favorites } = usePrefs();
  const favs = TOOLS.filter((t) => favorites.includes(t.id));

  return (
    <div className="page settings">
      <h1>Settings</h1>

      <section className="set" aria-labelledby="set-appearance">
        <h2 id="set-appearance" className="section-h">
          Appearance
        </h2>
        <p className="muted">Dark is the default. System follows this device's setting.</p>
        <Segmented label="Theme" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
      </section>

      <section className="set" aria-labelledby="set-favs">
        <h2 id="set-favs" className="section-h">
          Favorites
        </h2>
        {favs.length === 0 ? (
          <p className="muted">No favorites yet. Use the star beside a tool in the sidebar.</p>
        ) : (
          <ul className="row-list">
            {favs.map((t) => (
              <li key={t.id} className="fav-row">
                <t.icon aria-hidden="true" />
                <span>{t.name}</span>
                <Button size="sm" variant="ghost" aria-label={`Remove ${t.name} from favorites`} onClick={() => removeFavorite(t.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="set" aria-labelledby="set-session">
        <h2 id="set-session" className="section-h">
          Session
        </h2>
        <p className="muted">
          Clearing cancels running jobs and releases this tab's references to files and results. It is not forensic erasure: the browser or device may keep traces.
        </p>
        <div>
          <ClearSessionButton size="md" />
        </div>
      </section>

      <section className="set" aria-labelledby="set-engines">
        <h2 id="set-engines" className="section-h">
          Downloaded engines and models
        </h2>
        <p className="muted">No engines or models are cached yet.</p>
      </section>

      <section className="set" aria-labelledby="set-privacy">
        <h2 id="set-privacy" className="section-h">
          Privacy
        </h2>
        <p className="muted">
          Files are processed in this browser. The web host still receives ordinary page and asset requests. Tools that use the network are labelled.
        </p>
      </section>
    </div>
  );
}
