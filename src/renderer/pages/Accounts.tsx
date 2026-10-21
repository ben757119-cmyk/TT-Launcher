import { useEffect, useState } from 'react';

type Props = { toast: (s: string) => void; refresh: () => void };

export default function Accounts({ toast, refresh }: Props) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [configured, setConfigured] = useState(false);
  const [clientId, setClientId] = useState('');
  const [offlineName, setOfflineName] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setAccounts(await window.tt.listAccounts());
    setConfigured(await window.tt.clientIdConfigured());
    const s = await window.tt.getSettings();
    setClientId(s.msClientId || '');
  };

  useEffect(() => {
    load();
    const off = window.tt.onAuthProgress((p: any) => setProgress(p.message));
    return off;
  }, []);

  const saveClientId = async () => {
    await window.tt.setSettings({ msClientId: clientId.trim() });
    setConfigured(!!clientId.trim());
    toast('Client ID saved');
  };

  const signIn = async () => {
    setError(null);
    setProgress('Starting…');
    try {
      const acc = await window.tt.signInMs();
      toast(`Signed in as ${acc.name}`);
      await load();
      refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div>
      <h1 className="page-title">Accounts</h1>
      <p className="page-sub">
        Legitimate Microsoft authentication only. TT Launcher never asks for your Microsoft password
        in a custom form.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Azure App Client ID</div>
        <p style={{ color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.5 }}>
          Register a public client app in Azure Portal, enable public client flows, then paste the
          Application (client) ID here. Details in <code>AUTH.md</code>.
        </p>
        <div className="row">
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{
              flex: 1,
              background: 'var(--bg-0)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              padding: '10px 12px',
              fontFamily: 'ui-monospace, monospace',
            }}
          />
          <button className="btn btn-ghost" onClick={saveClientId}>
            Save
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          {configured ? (
            <span className="badge badge-teal">Configured</span>
          ) : (
            <span className="badge badge-warn">Not configured</span>
          )}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={signIn} disabled={!configured}>
          Sign in with Microsoft
        </button>
        <input
          value={offlineName}
          onChange={(e) => setOfflineName(e.target.value)}
          placeholder="Offline name (testing only)"
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '10px 12px',
          }}
        />
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await window.tt.signInOffline(offlineName || 'Player');
            toast('Offline account added (cannot join online-mode servers)');
            load();
            refresh();
          }}
        >
          Add offline
        </button>
      </div>

      {progress && <div className="ok-box" style={{ marginBottom: 12 }}>{progress}</div>}
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="list">
        {accounts.map((a) => (
          <div key={a.id} className="list-item">
            {a.avatarUrl ? <img src={a.avatarUrl} alt="" /> : <div style={{ width: 48, height: 48 }} />}
            <div className="meta">
              <strong>{a.name}</strong>
              <span>
                {a.type} · {a.uuid?.slice(0, 8)}…
              </span>
            </div>
            <button
              className="btn btn-teal"
              onClick={async () => {
                await window.tt.selectAccount(a.id);
                toast(`Selected ${a.name}`);
                refresh();
              }}
            >
              Use
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await window.tt.removeAccount(a.id);
                load();
                refresh();
              }}
            >
              Remove
            </button>
          </div>
        ))}
        {!accounts.length && <div className="empty">No accounts yet</div>}
      </div>
    </div>
  );
}
