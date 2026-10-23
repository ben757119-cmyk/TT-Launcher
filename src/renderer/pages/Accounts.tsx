import { useEffect, useState } from 'react';

type Props = { toast: (s: string) => void; refresh: () => void };

export default function Accounts({ toast, refresh }: Props) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setAccounts(await window.tt.listAccounts());
  };

  useEffect(() => {
    load();
    const off = window.tt.onAuthProgress((p: any) => setProgress(p.message));
    return off;
  }, []);

  const importOfficial = async () => {
    setError(null);
    setProgress('Reading official Minecraft Launcher…');
    try {
      const acc = await window.tt.importOfficialAccount();
      if (!acc) {
        setError(
          'No account found. Open the normal Minecraft Launcher, sign in with Microsoft, close it, then try again.',
        );
      } else {
        toast(`Using ${acc.name}`);
        await load();
        refresh();
      }
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
        Use the account already signed into the official Minecraft Launcher. No offline mode.
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={importOfficial}>
          Use my Minecraft account
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
        {!accounts.length && (
          <div className="empty">No accounts yet — click Use my Minecraft account.</div>
        )}
      </div>
    </div>
  );
}
