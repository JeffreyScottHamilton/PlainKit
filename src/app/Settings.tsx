import { useEffect, useState } from 'react';
import { Button, Notice, Segmented } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { deleteModelCaches, listModelCaches } from '@/engines/cutout/cache';
import { pwa, refreshOfflineInfo, removeOfflineCopy, saveAllForOffline } from './pwa';
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

      <OfflineSection />
      <ModelSection />

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

function OfflineSection() {
  const s = pwa.use((x) => x);
  useEffect(() => refreshOfflineInfo(), []);
  const i = s.info;
  return (
    <section className="set" aria-labelledby="set-offline">
      <h2 id="set-offline" className="section-h">
        Offline use
      </h2>
      {!s.supported ? (
        <p className="muted">This browser cannot keep the app for offline use.</p>
      ) : !s.active ? (
        <p className="muted">Offline use is not set up in this tab. It is only available on the published site, not in development.</p>
      ) : (
        <>
          <p className="muted">
            The app shell works offline. Each tool is kept for offline use after you open it once.
            {i ? ` Saved now: ${i.cached} of ${i.total} app files (${formatBytes(i.cachedBytes)} of ${formatBytes(i.totalBytes)}).` : ''} Your files are never stored here.
          </p>
          {s.error && <Notice kind="error">{s.error}</Notice>}
          <div className="pk-row">
            <Button onClick={saveAllForOffline} disabled={s.busy || (i ? i.cached >= i.total : false)}>
              {s.busy ? 'Saving…' : i && i.cached >= i.total ? 'All tools saved for offline use' : `Save all tools for offline use${i ? ` (${formatBytes(i.totalBytes - i.cachedBytes)} more)` : ''}`}
            </Button>
            <Button variant="ghost" onClick={() => void removeOfflineCopy()}>
              Remove offline copy
            </Button>
          </div>
          <p className="muted">Cutout also needs its model. Tick "Keep the model on this device" in Cutout to use it offline.</p>
        </>
      )}
    </section>
  );
}

function ModelSection() {
  const [list, setList] = useState<{ name: string; bytes: number }[] | null>(null);
  const load = () => void listModelCaches().then(setList, () => setList([]));
  useEffect(load, []);
  return (
    <section className="set" aria-labelledby="set-engines">
      <h2 id="set-engines" className="section-h">
        Downloaded engines and models
      </h2>
      {list === null ? (
        <p className="muted">Checking…</p>
      ) : list.length === 0 ? (
        <p className="muted">No models are kept on this device. Clearing the session does not affect this.</p>
      ) : (
        <>
          <ul className="row-list">
            {list.map((m) => (
              <li key={m.name} className="fav-row">
                <span className="mono">{m.name}</span>
                <span className="mono muted">{formatBytes(m.bytes)}</span>
              </li>
            ))}
          </ul>
          <div>
            <Button onClick={() => void deleteModelCaches().then(load)}>Delete downloaded models</Button>
          </div>
        </>
      )}
    </section>
  );
}
