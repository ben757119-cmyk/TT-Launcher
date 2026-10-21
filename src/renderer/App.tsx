import { useEffect, useState, useCallback } from 'react';
import Home from './pages/Home';
import Play from './pages/Play';
import ResourcePacks from './pages/ResourcePacks';
import Mods from './pages/Mods';
import Instances from './pages/Instances';
import Accounts from './pages/Accounts';
import Settings from './pages/Settings';
import About from './pages/About';

type Tab =
  | 'home'
  | 'play'
  | 'packs'
  | 'mods'
  | 'instances'
  | 'accounts'
  | 'settings'
  | 'about';

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'play', label: 'Play', icon: '▶' },
  { id: 'packs', label: 'Resource Packs', icon: '▣' },
  { id: 'mods', label: 'Mods & Add-ons', icon: '⬡' },
  { id: 'instances', label: 'Instances', icon: '▦' },
  { id: 'accounts', label: 'Accounts', icon: '☺' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'about', label: 'About TT', icon: '✦' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [meta, setMeta] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [instance, setInstance] = useState<any>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);

  const toast = useCallback((text: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const refresh = useCallback(async () => {
    if (!window.tt) return;
    const [m, a, i] = await Promise.all([
      window.tt.getMeta(),
      window.tt.activeAccount(),
      window.tt.getDefaultInstance(),
    ]);
    setMeta(m);
    setAccount(a);
    setInstance(i);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, tab]);

  const page = (() => {
    switch (tab) {
      case 'home':
        return <Home account={account} instance={instance} meta={meta} onNavigate={setTab} toast={toast} refresh={refresh} />;
      case 'play':
        return <Play account={account} instance={instance} toast={toast} refresh={refresh} />;
      case 'packs':
        return <ResourcePacks instance={instance} toast={toast} />;
      case 'mods':
        return <Mods instance={instance} toast={toast} />;
      case 'instances':
        return <Instances toast={toast} refresh={refresh} />;
      case 'accounts':
        return <Accounts toast={toast} refresh={refresh} />;
      case 'settings':
        return <Settings toast={toast} />;
      case 'about':
        return <About meta={meta} />;
      default:
        return null;
    }
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TT</div>
          <div className="brand-text">
            <strong>TT Launcher</strong>
            <span>The Third</span>
          </div>
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-btn ${tab === n.id ? 'active' : ''}`}
            onClick={() => setTab(n.id)}
          >
            <span style={{ width: 18, textAlign: 'center', opacity: 0.8 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </aside>

      <main className="main">{page}</main>

      <footer className="status-bar">
        <span>
          <i className="dot" />
          {instance ? instance.name : 'No instance'}
        </span>
        <span>
          {account ? account.name : 'Not signed in'}
          {account?.type === 'offline' ? ' (offline)' : ''}
        </span>
        <span className="spacer" />
        <span>TT Launcher {meta?.launcherVersion || '…'}</span>
      </footer>

      <div className="toast-host">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
