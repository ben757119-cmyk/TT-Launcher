import { useEffect, useState } from 'react';

type Props = {
  account: any;
  instance: any;
  meta: any;
  onNavigate: (t: any) => void;
  toast: (s: string) => void;
  refresh: () => void;
};

const FALLBACK_VERSIONS = [
  '26.2', '26.1', '26.0',
  '1.21.11', '1.21.10', '1.21.9', '1.21.8', '1.21.7', '1.21.6',
  '1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
];

export default function Home({ account, instance, meta, onNavigate, toast, refresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loader, setLoader] = useState<'neoforge' | 'fabric'>('neoforge');
  const [mcVersion, setMcVersion] = useState('26.2');

  const versions: string[] = meta?.supportedVersions || FALLBACK_VERSIONS;
  const loaders = meta?.supportedLoaders || [
    { id: 'neoforge', label: 'NeoForge' },
    { id: 'fabric', label: 'Fabric' },
  ];

  useEffect(() => {
    (async () => {
      try {
        const s = await window.tt.getSettings();
        if (s.selectedLoader === 'fabric' || s.selectedLoader === 'neoforge') setLoader(s.selectedLoader);
        if (s.selectedMinecraftVersion) setMcVersion(s.selectedMinecraftVersion);
      } catch { /* */ }
    })();
  }, []);

  const persistTarget = async (nextLoader: string, nextVer: string) => {
    await window.tt.setSettings({
      selectedLoader: nextLoader,
      selectedMinecraftVersion: nextVer,
    });
  };

  const onLoader = async (v: 'neoforge' | 'fabric') => {
    setLoader(v);
    await persistTarget(v, mcVersion);
  };

  const onVersion = async (v: string) => {
    setMcVersion(v);
    await persistTarget(loader, v);
  };

  const launch = async () => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await persistTarget(loader, mcVersion);
      if (!account) {
        try {
          const acc = await window.tt.importOfficialAccount();
          if (acc) toast(`Using ${acc.name}`);
          else {
            setErr('No Microsoft account found.\n\nOpen the normal Minecraft Launcher, sign in once, close it, then press Launch again.');
            return;
          }
        } catch {
          setErr('Could not import your Minecraft account.\n\nOpen the normal Minecraft Launcher and sign in once first.');
          return;
        }
        refresh();
      }
      try { await window.tt.vanillaSetup(); } catch { /* */ }
      const res = await window.tt.play();
      if (res.ok) {
        setOk(res.message);
        toast(`Launching ${loader} ${mcVersion}…`);
      } else setErr(res.message);
      refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const owner = meta?.owner || { name: 'The_Algorithm67', email: 'ben757119@gmail.com', discord: '@pyforge_' };

  return (
    <div className="home-wrap">
      <div className="hero">
        <div className="hero-badge">
          <span>●</span> {loader === 'fabric' ? 'Fabric' : 'NeoForge'} · MC {mcVersion} · The Third
        </div>
        <h1>TT Client</h1>
        <p>
          Pick your loader and Minecraft version, then Launch. Supports Fabric &amp; NeoForge from 1.21.11 through 26.2.
        </p>

        <div className="row" style={{ marginBottom: 18, gap: 12, flexWrap: 'wrap', maxWidth: 560, position: 'relative', zIndex: 1 }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Loader</label>
            <select value={loader} onChange={(e) => onLoader(e.target.value as 'neoforge' | 'fabric')} style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '12px 14px', color: 'var(--text)', fontWeight: 600 }}>
              {loaders.map((l: any) => (
                <option key={l.id || l} value={l.id || l}>{l.label || l}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Minecraft version</label>
            <select value={mcVersion} onChange={(e) => onVersion(e.target.value)} style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '12px 14px', color: 'var(--text)', fontWeight: 600 }}>
              {versions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="launch-row">
          <button className="btn-launch" disabled={busy} onClick={launch}>
            {busy ? 'Launching…' : `▶  LAUNCH  ${loader === 'fabric' ? 'Fabric' : 'NeoForge'} ${mcVersion}`}
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('play')}>Install TT Client</button>
          <button className="btn-secondary" onClick={() => onNavigate('accounts')}>{account ? account.name : 'Account'}</button>
        </div>

        {ok && <div className="ok-box" style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{ok}</div>}
        {err && <div className="error-box" style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{err}</div>}
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Target</div>
          <div className="stat-value">{loader === 'fabric' ? 'Fabric' : 'NeoForge'} · {mcVersion}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Account</div>
          <div className={`stat-value ${account ? '' : 'muted'}`}>{account ? account.name : 'Sign in via Minecraft Launcher'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TT Client</div>
          <div className="stat-value">{instance?.ttClientVersion ? <span className="badge badge-teal">{instance.ttClientVersion}</span> : <span className="badge badge-warn">Install from Play</span>}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Support</div>
          <div className="stat-value muted" style={{ fontSize: 12 }}>{owner.name} · {owner.discord}</div>
        </div>
      </div>
    </div>
  );
}
