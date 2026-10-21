import { useEffect, useState } from 'react';

type Props = { toast: (s: string) => void };

export default function Settings({ toast }: Props) {
  const [s, setS] = useState<any>(null);

  useEffect(() => {
    window.tt.getSettings().then(setS);
  }, []);

  if (!s) return <div className="empty">Loading settings…</div>;

  const patch = async (p: Record<string, unknown>) => {
    const next = await window.tt.setSettings(p);
    setS(next);
    toast('Settings saved');
  };

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Persisted locally on this machine.</p>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Minecraft</div>
          <div className="field">
            <label>Memory (MB)</label>
            <input
              type="number"
              value={s.memoryMb}
              onChange={(e) => setS({ ...s, memoryMb: Number(e.target.value) })}
              onBlur={() => patch({ memoryMb: s.memoryMb })}
            />
          </div>
          <div className="field">
            <label>Java path (optional)</label>
            <input
              value={s.javaPath || ''}
              onChange={(e) => setS({ ...s, javaPath: e.target.value })}
              onBlur={() => patch({ javaPath: s.javaPath })}
              placeholder="e.g. C:\Program Files\Eclipse Adoptium\jdk-21\bin\java.exe"
            />
          </div>
          <div className="field">
            <label>JVM arguments</label>
            <input
              value={s.jvmArgs || ''}
              onChange={(e) => setS({ ...s, jvmArgs: e.target.value })}
              onBlur={() => patch({ jvmArgs: s.jvmArgs })}
            />
          </div>
          <div className="field">
            <label>Instances root</label>
            <input
              value={s.gameDirectoryRoot || ''}
              onChange={(e) => setS({ ...s, gameDirectoryRoot: e.target.value })}
              onBlur={() => patch({ gameDirectoryRoot: s.gameDirectoryRoot })}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-title">TT Client</div>
          <label className="row" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={!!s.autoInstallTtPack}
              onChange={(e) => patch({ autoInstallTtPack: e.target.checked })}
            />
            Auto-install official TT resource pack when available
          </label>
          <label className="row" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={!!s.autoEnableTtPack}
              onChange={(e) => patch({ autoEnableTtPack: e.target.checked })}
            />
            Auto-enable TT resource pack
          </label>
          <div className="field">
            <label>GitHub owner</label>
            <input
              value={s.githubOwner || ''}
              onChange={(e) => setS({ ...s, githubOwner: e.target.value })}
              onBlur={() => patch({ githubOwner: s.githubOwner })}
            />
          </div>
          <div className="field">
            <label>GitHub repo</label>
            <input
              value={s.githubRepo || ''}
              onChange={(e) => setS({ ...s, githubRepo: e.target.value })}
              onBlur={() => patch({ githubRepo: s.githubRepo })}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Appearance</div>
          <label className="row" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={!!s.particles}
              onChange={(e) => patch({ particles: e.target.checked })}
            />
            Background particles
          </label>
          <label className="row" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={!!s.reducedMotion}
              onChange={(e) => patch({ reducedMotion: e.target.checked })}
            />
            Reduced motion
          </label>
        </div>

        <div className="card">
          <div className="card-title">Diagnostics</div>
          <button className="btn btn-ghost" onClick={() => window.tt.openLog()}>
            Open launcher log
          </button>
        </div>
      </div>
    </div>
  );
}
