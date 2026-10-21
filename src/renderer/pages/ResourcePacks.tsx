import { useEffect, useState } from 'react';

type Props = { instance: any; toast: (s: string) => void };

export default function ResourcePacks({ instance, toast }: Props) {
  const [tab, setTab] = useState<'browse' | 'installed'>('browse');
  const [query, setQuery] = useState('cpvp');
  const [hits, setHits] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [installed, setInstalled] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const gameVersion = instance?.minecraftVersion || '26.2';

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.tt.modrinthSearch({
        query,
        projectType: 'resourcepack',
        versions: [gameVersion, '1.21.1', '1.21'],
        limit: 24,
        index: 'downloads',
      });
      setHits(res.hits || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadInstalled = async () => {
    setInstalled(await window.tt.listPacks());
  };

  useEffect(() => {
    search();
    loadInstalled();
    const off = window.tt.onPackProgress((p: any) => setProgress(`${p.msg} (${p.pct}%)`));
    return off;
  }, []);

  const install = async (projectId: string) => {
    setProgress('Starting…');
    try {
      await window.tt.installPackModrinth({ projectId, gameVersion });
      toast('Pack installed');
      await loadInstalled();
      setTab('installed');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div>
      <h1 className="page-title">Resource Packs</h1>
      <p className="page-sub">Browse Modrinth and manage packs for the selected instance.</p>

      <div className="row" style={{ marginBottom: 16 }}>
        <button
          className={`btn ${tab === 'browse' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('browse')}
        >
          Browse
        </button>
        <button
          className={`btn ${tab === 'installed' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => {
            setTab('installed');
            loadInstalled();
          }}
        >
          Installed ({installed.length})
        </button>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await window.tt.installPackFile();
            toast('Imported pack');
            loadInstalled();
          }}
        >
          Import ZIP…
        </button>
      </div>

      {progress && <div className="ok-box" style={{ marginBottom: 12 }}>{progress}</div>}
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      {tab === 'browse' && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <input
              style={{
                flex: 1,
                background: 'var(--bg-1)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search Modrinth resource packs…"
            />
            <button className="btn btn-primary" disabled={loading} onClick={search}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div style={{ color: 'var(--text-mute)', marginBottom: 8, fontSize: 12 }}>
            {total} results · filtered for resource packs · game {gameVersion}
          </div>
          <div className="list">
            {hits.map((h) => (
              <div key={h.project_id} className="list-item">
                {h.icon_url ? <img src={h.icon_url} alt="" /> : <div style={{ width: 48, height: 48 }} />}
                <div className="meta">
                  <strong>{h.title}</strong>
                  <span>
                    {h.downloads?.toLocaleString?.() || h.downloads} downloads · {h.slug}
                  </span>
                </div>
                <button className="btn btn-teal" onClick={() => install(h.project_id)}>
                  Install
                </button>
              </div>
            ))}
            {!hits.length && !loading && <div className="empty">No packs found</div>}
          </div>
        </>
      )}

      {tab === 'installed' && (
        <div className="list">
          {installed.map((p) => (
            <div key={p.id} className="list-item">
              {p.iconUrl ? <img src={p.iconUrl} alt="" /> : <div style={{ width: 48, height: 48 }} />}
              <div className="meta">
                <strong>{p.name}</strong>
                <span>
                  {p.versionNumber || '—'} · {p.source} · {p.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await window.tt.setPackEnabled(p.id, !p.enabled);
                  loadInstalled();
                }}
              >
                {p.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await window.tt.uninstallPack(p.id);
                  loadInstalled();
                }}
              >
                Remove
              </button>
            </div>
          ))}
          {!installed.length && <div className="empty">No packs installed via TT Launcher yet</div>}
        </div>
      )}
    </div>
  );
}
