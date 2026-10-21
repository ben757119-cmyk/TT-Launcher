import { useEffect, useState } from 'react';

type Props = {
  account: any;
  instance: any;
  toast: (s: string) => void;
  refresh: () => void;
};

export default function Play({ account, instance, toast, refresh }: Props) {
  const [progress, setProgress] = useState<{ stage: string; message: string; percent?: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [releases, setReleases] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ running: boolean; pid: number | null }>({
    running: false,
    pid: null,
  });

  useEffect(() => {
    const off = window.tt.onTtInstallProgress((p: any) => setProgress(p));
    window.tt.launchStatus().then(setStatus);
    const t = setInterval(() => window.tt.launchStatus().then(setStatus), 2000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);

  const loadReleases = async () => {
    setError(null);
    try {
      const r = await window.tt.fetchTtReleases();
      setReleases(r);
    } catch (e: any) {
      setError(e?.message || String(e));
      setReleases([]);
    }
  };

  useEffect(() => {
    loadReleases();
  }, []);

  const install = async (tag?: string) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await window.tt.installTt(tag);
      setOk(`Installed ${res.version}`);
      toast(`TT Client ${res.version} installed`);
      refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const installFile = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.tt.installTtFromFile();
      if (res) {
        setOk('Installed local JAR');
        toast('Installed TT Client from file');
        refresh();
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const play = async () => {
    setError(null);
    setOk(null);
    const res = await window.tt.play();
    if (res.ok) {
      setOk(res.message);
      toast('Launching…');
    } else {
      setError(res.message);
    }
    setStatus(await window.tt.launchStatus());
  };

  return (
    <div>
      <h1 className="page-title">Play</h1>
      <p className="page-sub">Install TT Client, then launch NeoForge with your account.</p>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Launch</div>
          <dl className="kv" style={{ marginBottom: 16 }}>
            <dt>Account</dt>
            <dd>{account?.name || '—'}</dd>
            <dt>Instance</dt>
            <dd>{instance?.name || '—'}</dd>
            <dt>TT version</dt>
            <dd>{instance?.ttClientVersion || 'Not installed'}</dd>
            <dt>Status</dt>
            <dd>{status.running ? `Running (pid ${status.pid})` : 'Idle'}</dd>
          </dl>
          <div className="row">
            <button className="btn btn-teal btn-lg" disabled={busy || status.running} onClick={play}>
              ▶  Launch Minecraft
            </button>
            {status.running && (
              <button className="btn btn-danger" onClick={() => window.tt.stop()}>
                Stop
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Install TT Client</div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => install()}>
              Install latest
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={installFile}>
              Install from JAR…
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={loadReleases}>
              Refresh releases
            </button>
          </div>
          {progress && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{progress.message}</div>
              <div className="progress">
                <i style={{ width: `${progress.percent ?? 30}%` }} />
              </div>
            </>
          )}
          {ok && <div className="ok-box" style={{ marginTop: 12 }}>{ok}</div>}
          {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">GitHub releases</div>
        {!releases.length && !error && <div className="empty">No releases loaded</div>}
        <div className="list">
          {releases.map((r) => (
            <div key={r.tag} className="list-item">
              <div className="meta">
                <strong>{r.name || r.tag}</strong>
                <span>
                  {r.tag} · {r.assets?.length || 0} assets ·{' '}
                  {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : ''}
                </span>
              </div>
              <button className="btn btn-ghost" disabled={busy} onClick={() => install(r.tag)}>
                Install
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
