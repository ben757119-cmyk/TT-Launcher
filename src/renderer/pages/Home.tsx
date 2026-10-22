import { useState } from 'react';

type Props = {
  account: any;
  instance: any;
  meta: any;
  onNavigate: (t: any) => void;
  toast: (s: string) => void;
  refresh: () => void;
};

export default function Home({ account, instance, meta, onNavigate, toast, refresh }: Props) {
  const [offlineName, setOfflineName] = useState('Player');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setupAndPlay = async () => {
    setBusy(true);
    setErr(null);
    try {
      await window.tt.vanillaSetup();
      const res = await window.tt.play();
      if (res.ok) toast(res.message);
      else setErr(res.message);
      refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const useOfficial = async () => {
    setBusy(true);
    setErr(null);
    try {
      const acc = await window.tt.importOfficialAccount();
      if (!acc) {
        setErr(
          'No account found in the official Minecraft Launcher. Open the normal Minecraft Launcher, sign in once, then try again.',
        );
      } else {
        toast(`Using ${acc.name} from Minecraft Launcher`);
        refresh();
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const offline = async () => {
    setBusy(true);
    setErr(null);
    try {
      await window.tt.signInOffline(offlineName.trim() || 'Player');
      toast('Signed in offline');
      refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const owner = meta?.owner || {
    name: 'The_Algorithm67',
    email: 'ben757119@gmail.com',
    discord: '@pyforge_',
  };

  return (
    <div className="home-wrap">
      <div className="hero">
        <div className="hero-badge">
          <span>●</span> The Third · NeoForge {meta?.ttCompat?.neoforge || '26.2'}
        </div>
        <h1>TT Client</h1>
        <p>
          Uses your normal <strong>.minecraft</strong> folder (mods + resource packs). TT Client and the
          TT resource pack are bundled and installed automatically. Sign into the official Minecraft
          Launcher once, then hit Launch to use that account.
        </p>

        {!account && (
          <div className="launch-row" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <button className="btn-secondary" disabled={busy} onClick={useOfficial}>
              Use my Minecraft account
            </button>
            <div className="row" style={{ maxWidth: 360 }}>
              <input
                style={{ flex: 1 }}
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
                placeholder="Offline name"
              />
              <button className="btn-secondary" disabled={busy} onClick={offline}>
                Offline
              </button>
            </div>
          </div>
        )}

        <div className="launch-row">
          <button className="btn-launch" disabled={busy} onClick={setupAndPlay}>
            ▶  LAUNCH
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('play')}>
            Play / Install
          </button>
          {account && (
            <button className="btn-secondary" onClick={() => onNavigate('accounts')}>
              {account.name}
            </button>
          )}
        </div>

        {err && (
          <div
            className="error-box"
            style={{ marginTop: 20, whiteSpace: 'pre-wrap', position: 'relative', zIndex: 1 }}
          >
            {err}
          </div>
        )}
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Account</div>
          <div className={`stat-value ${account ? '' : 'muted'}`}>
            {account
              ? `${account.name}${account.type === 'offline' ? ' (offline)' : ''}`
              : 'Use official MC Launcher'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">.minecraft</div>
          <div className="stat-value muted" style={{ fontSize: 13 }}>
            {meta?.minecraftDir || 'Auto-detect'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TT Client</div>
          <div className="stat-value">
            {instance?.ttClientVersion ? (
              <span className="badge badge-teal">{instance.ttClientVersion}</span>
            ) : (
              <span className="badge badge-teal">Bundled</span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Support</div>
          <div className="stat-value muted" style={{ fontSize: 12 }}>
            {owner.name} · {owner.discord}
          </div>
        </div>
      </div>
    </div>
  );
}
