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
  const [name, setName] = useState('Player');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const owner = meta?.owner || {
    name: 'The_Algorithm67',
    email: 'ben757119@gmail.com',
    discord: '@pyforge_',
  };

  const go = async () => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      if (!account) {
        try {
          const acc = await window.tt.importOfficialAccount();
          if (acc) toast(`Using ${acc.name} from Minecraft Launcher`);
          else await window.tt.signInOffline(name.trim() || 'Player');
        } catch {
          await window.tt.signInOffline(name.trim() || 'Player');
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
        toast('Launch OK');
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

  const offline = async () => {
    setBusy(true);
    setErr(null);
    try {
      await window.tt.signInOffline(name.trim() || 'Player');
      toast('Signed in offline — you can Launch now');
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
          'No account found from the official Minecraft Launcher.\n\n' +
            '1. Open the normal Minecraft Launcher\n' +
            '2. Sign in with Microsoft there\n' +
            '3. Come back and click this again\n\n' +
            'Or type a name and use Offline (works without Microsoft).',
        );
      } else {
        toast(`Using ${acc.name}`);
        refresh();
      }
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
          <span>●</span> The Third · by {owner.name}
        </div>
        <h1>TT Client</h1>
        <p>
          Launch installs TT into your normal <strong>.minecraft</strong> folder and opens the{' '}
          <strong>official Minecraft Launcher</strong> so your real account works. No Azure setup.
        </p>

        <div className="row" style={{ marginBottom: 14, maxWidth: 480, flexWrap: 'wrap', gap: 8 }}>
          <input
            style={{ flex: 1, minWidth: 140 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Offline name"
          />
          <button className="btn-secondary" disabled={busy} onClick={offline}>
            Sign in offline
          </button>
          <button className="btn-secondary" disabled={busy} onClick={useOfficial}>
            Use MC Launcher account
          </button>
        </div>

        <div className="launch-row">
          <button className="btn-launch" disabled={busy} onClick={go}>
            {busy ? 'Working…' : '▶  LAUNCH'}
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('play')}>
            Install TT JAR
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('accounts')}>
            {account ? account.name : 'Accounts'}
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
            {account ? account.name : 'Not signed in — use Offline'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">.minecraft</div>
          <div className="stat-value muted" style={{ fontSize: 12 }}>
            {meta?.minecraftDir || '%AppData%\\.minecraft'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Help</div>
          <div className="stat-value muted" style={{ fontSize: 12 }}>
            {owner.email}
            <br />
            {owner.discord}
          </div>
        </div>
      </div>
    </div>
  );
}
