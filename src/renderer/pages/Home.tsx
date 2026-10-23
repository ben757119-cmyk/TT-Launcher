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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const owner = meta?.owner || {
    name: 'The_Algorithm67',
    email: 'ben757119@gmail.com',
    discord: '@pyforge_',
  };

  const launch = async () => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      if (!account) {
        try {
          const acc = await window.tt.importOfficialAccount();
          if (acc) toast(`Using ${acc.name}`);
          else {
            setErr(
              'No Microsoft account found.\n\nOpen the normal Minecraft Launcher, sign in once, close it, then press Launch again.',
            );
            return;
          }
        } catch {
          setErr(
            'Could not import your Minecraft account.\n\nOpen the normal Minecraft Launcher and sign in once first.',
          );
          return;
        }
        refresh();
      }
      try {
        await window.tt.vanillaSetup();
      } catch {
        /* optional */
      }
      const res = await window.tt.play();
      if (res.ok) {
        setOk(res.message);
        toast('Launching…');
      } else {
        setErr(res.message);
      }
      refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home-wrap">
      <div className="hero">
        <div className="hero-badge">
          <span>●</span> NeoForge {meta?.ttCompat?.neoforge || '26.2'} · The Third
        </div>
        <h1>TT Client</h1>
        <p>
          One click launches Minecraft with TT in your normal <strong>.minecraft</strong> folder.
          Sign into the official Minecraft Launcher once so we can use your account.
        </p>

        <div className="launch-row">
          <button className="btn-launch" disabled={busy} onClick={launch}>
            {busy ? 'Launching…' : '▶  LAUNCH'}
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('play')}>
            Install TT Client
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('accounts')}>
            {account ? account.name : 'Account'}
          </button>
        </div>

        {ok && (
          <div className="ok-box" style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>
            {ok}
          </div>
        )}
        {err && (
          <div className="error-box" style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>
            {err}
          </div>
        )}
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Account</div>
          <div className={`stat-value ${account ? '' : 'muted'}`}>
            {account ? account.name : 'Sign in via Minecraft Launcher'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TT Client</div>
          <div className="stat-value">
            {instance?.ttClientVersion ? (
              <span className="badge badge-teal">{instance.ttClientVersion}</span>
            ) : (
              <span className="badge badge-warn">Not installed</span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">.minecraft</div>
          <div className="stat-value muted" style={{ fontSize: 12 }}>
            {meta?.minecraftDir || '%AppData%\\.minecraft'}
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
