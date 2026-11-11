import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { getTool } from '@/registry';
import { announcer } from './announce';
import { BRAND } from './brand';
import { CommandSearch } from './CommandSearch';
import { ErrorBoundary } from './ErrorBoundary';
import { Home } from './Home';
import { recordRecent } from './prefs';
import { Settings } from './Settings';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Tray } from './Tray';
import './shell.css';

// Lazy components are cached per tool so switching tools does not re-create them.
const lazyTools = new Map<string, LazyExoticComponent<ComponentType>>();

function ToolRoute() {
  const { id = '' } = useParams();
  const tool = getTool(id);
  useEffect(() => {
    if (tool) recordRecent(tool.id);
  }, [tool]);
  if (!tool) return <Navigate to="/" replace />;
  let Comp = lazyTools.get(tool.id);
  if (!Comp) {
    Comp = lazy(tool.load);
    lazyTools.set(tool.id, Comp);
  }
  return (
    <ErrorBoundary>
      <Suspense fallback={<p className="page muted">Loading {tool.name}…</p>}>
        <Comp />
      </Suspense>
    </ErrorBoundary>
  );
}

function titleFor(pathname: string): string {
  const id = /^\/tools\/([^/]+)$/.exec(pathname)?.[1];
  const tool = id ? getTool(id) : undefined;
  if (tool) return `${tool.title} · ${BRAND.name}`;
  if (pathname === '/settings') return `Settings · ${BRAND.name}`;
  return BRAND.name;
}

function LiveRegion() {
  const a = announcer.use((s) => s);
  return (
    <div className="sr-only" role="status" aria-live="polite">
      <span key={a.n}>{a.text}</span>
    </div>
  );
}

export function App() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const prevPath = useRef<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);

  // Route change moves focus to main (not on first load, so deep links keep their normal start).
  useEffect(() => {
    const prev = prevPath.current;
    prevPath.current = pathname;
    if (prev !== null && prev !== pathname) {
      mainRef.current?.scrollTo({ top: 0 });
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [pathname]);

  // Ctrl/Cmd+K opens command search, unless another dialog is already open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openMenu = () => {
    const d = drawerRef.current;
    if (d && !d.open) {
      d.showModal();
      setMenuOpen(true);
    }
  };
  const closeMenu = () => drawerRef.current?.close();

  return (
    <div className="shell">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>

      <aside className="shell__side" aria-label="Sidebar">
        <Sidebar />
      </aside>

      <div className="shell__col">
        <TopBar menuOpen={menuOpen} onOpenMenu={openMenu} onOpenSearch={() => setSearchOpen(true)} />
        <main id="main" ref={mainRef} tabIndex={-1} className="shell__main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tools/:id" element={<ToolRoute />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Tray />
      </div>

      <dialog
        id="tools-drawer"
        ref={drawerRef}
        className="drawer"
        aria-label="Tools menu"
        onClose={() => setMenuOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeMenu();
        }}
      >
        <div className="drawer__inner">
          <button type="button" className="drawer__close" aria-label="Close tools menu" onClick={closeMenu}>
            <X aria-hidden="true" />
          </button>
          <Sidebar onNavigate={closeMenu} />
        </div>
      </dialog>

      <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <LiveRegion />
    </div>
  );
}
