import { useEffect, useRef, useState } from 'react';

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

type LogLine = { t: number; text: string };

export default function Home({ account, instance, meta, onNavigate, toast, refresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loader, setLoader] = useState<'neoforge' | 'fabric'>('neoforge');
  const [mcVersion, setMcVersion] = useState('26.2');
  const [logOpen, setLogOpen] = useState(false);
  const [pct, setPct] = useState(0);
  const [step, setStep] = useState('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [killing, setKilling] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const off = window.tt.onLaunchProgress?.((p: { pct: number; step: string; log: string }) => {
      setPct(Math.max(0, Math.min(100, p.pct | 0)));
      setStep(p.step || '');
      setLines((prev) => [...prev.slice(-200), { t: Date.now(), text: p.log || p.step }]);
    });
    return () => { try { off?.(); } catch { /* */ } };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

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

  const appendLocal = (text: string, p?: number) => {
    if (typeof p === 'number') setPct(p);
    setLines((prev) => [...prev, { t: Date.now(), text }]);
  };

  const launch = async () => {
    setBusy(true);
    setErr(null);
    setOk(null);
    setLogOpen(true);
    setPct(0);
    setStep('start');
    setLines([{ t: Date.now(), text: `Preparing ${loader} ${mcVersion}…` }]);
    try {
      await persistTarget(loader, mcVersion);
      if (!account) {
        appendLocal('Importing account from Minecraft Launcher…', 5);
        try {
          const acc = await window.tt.importOfficialAccount();
          if (acc) {
            toast(`Using ${acc.name}`);
            appendLocal(`Account: ${acc.name}`, 10);
          } else {
            setErr('No Microsoft account found.\n\nOpen the normal Minecraft Launcher, sign in once, close it, then press Launch again.');
            appendLocal('ERROR: No account found', 0);
            return;
          }
        } catch {
          setErr('Could not import your Minecraft account.\n\nOpen the normal Minecraft Launcher and sign in once first.');
          appendLocal('ERROR: Account import failed', 0);
          return;
        }
        refresh();
      }
      try {
        appendLocal('Setting up .minecraft…', 12);
        await window.tt.vanillaSetup();
      } catch { /* */ }
      appendLocal('Starting launch pipeline…', 15);
      const res = await window.tt.play();
      if (res.ok) {
        setOk(res.message);
        setPct(100);
        appendLocal(res.message || 'Launch OK');
        toast(`Launching ${loader} ${mcVersion}…`);
      } else {
        setErr(res.message);
        appendLocal(`ERROR: ${res.message}`);
      }
      refresh();
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErr(msg);
      appendLocal(`ERROR: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const endAll = async () => {
    setKilling(true);
    setLogOpen(true);
    appendLocal('Ending all Minecraft / launcher processes…');
    try {
      const res = await window.tt.killAllProcesses();
      appendLocal(res?.message || 'Done');
      toast(res?.message || 'Processes ended');
      setOk(res?.message || 'Ended all Minecraft processes');
    } catch (e: any) {
      appendLocal(`ERROR: ${e?.message || e}`);
    } finally {
      setKilling(false);
      setBusy(false);
    }
  };

  const owner = meta?.owner || { name: 'The_Algorithm67', email: 'ben757119@gmail.com', discord: '@pyforge_' };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#12131c',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 10,
    padding: '12px 36px 12px 14px',
    color: '#f2f3f7',
    fontWeight: 600,
  };

  return (
    <div className="home-wrap">
      <div className="hero">
        <div className="hero-badge">
          <span>●</span> {loader === 'fabric' ? 'Fabric' : 'NeoForge'} · MC {mcVersion} · The Third
        </div>
        <h1>TT Client</h1>
        <p>Pick loader + version, then Launch. A log and progress bar open while starting.</p>

        <div className="row" style={{ marginBottom: 18, gap: 12, flexWrap: 'wrap', maxWidth: 560, position: 'relative', zIndex: 1 }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8b93a7', marginBottom: 6 }}>Loader</label>
            <select className="tt-select" value={loader} onChange={(e) => onLoader(e.target.value as 'neoforge' | 'fabric')} style={selectStyle}>
              {loaders.map((l: any) => (
                <option key={l.id || l} value={l.id || l} style={{ backgroundColor: '#12131c', color: '#f2f3f7' }}>{l.label || l}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8b93a7', marginBottom: 6 }}>Minecraft version</label>
            <select className="tt-select" value={mcVersion} onChange={(e) => onVersion(e.target.value)} style={selectStyle}>
              {versions.map((v) => (
                <option key={v} value={v} style={{ backgroundColor: '#12131c', color: '#f2f3f7' }}>{v}</option>
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
          <button className="btn-danger-solid" disabled={killing} onClick={endAll} title="Force-close Minecraft + Minecraft Launcher">
            {killing ? 'Ending…' : '⏹ End All Processes'}
          </button>
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

      {logOpen && (
        <div className="launch-overlay">
          <div className="launch-panel">
            <div className="launch-panel-head">
              <div>
                <div className="launch-panel-title">Launch log</div>
                <div className="launch-panel-sub">{step ? `Step: ${step}` : 'Waiting…'} · {pct}%</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn-danger-solid" disabled={killing} onClick={endAll}>
                  {killing ? 'Ending…' : '⏹ End All'}
                </button>
                <button className="btn-ghost" onClick={() => setLogOpen(false)}>Close</button>
              </div>
            </div>
            <div className="launch-progress">
              <div className="launch-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="launch-log">
              {lines.map((l, i) => (
                <div key={i} className="launch-log-line">
                  <span className="launch-log-time">{new Date(l.t).toLocaleTimeString()}</span>
                  <span>{l.text}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
            <div className="launch-panel-foot">
              <span style={{ color: '#8b93a7', fontSize: 12 }}>
                End All kills Minecraft, javaw/java, and Minecraft Launcher processes.
              </span>
              {busy && <span className="badge badge-purple">Running</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
