import { useEffect, useState } from 'react';

type Props = { instance: any; toast: (s: string) => void };

const GAME = '26.2';
const LOADER = 'neoforge';

export default function Mods({ instance, toast }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<any[]>([]);
  const [installed, setInstalled] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInstalled = async () => {
    try {
      if ((window as any).tt.listMods) {
        setInstalled(await (window as any).tt.listMods());
      }
    } catch {
      setInstalled([]);
    }
  };

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.tt.modrinthSearch({
        query: query || undefined,
        projectType: 'mod',
        versions: [GAME],
        loaders: [LOADER],
        limit: 30,
        index: 'downloads',
      });
      const filtered = (res.hits || []).filter((h: any) => {
        const cats = (h.categories || []).map((c: string) => c.toLowerCase());
        return cats.includes('neoforge') || cats.includes('modloader-neoforge');
      });
      setHits(filtered);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    search();
    loadInstalled();
  }, []);

  const install = async (projectId: string) => {
    try {
      const versions = await window.tt.modrinthVersions(projectId, {
        loaders: [LOADER],
        gameVersions: [GAME],
      });
      if (!versions?.length) {
        setError('No NeoForge 26.2 build for this mod — hidden from install.');
        return;
      }
      const project = await window.tt.modrinthProject(projectId);
      await window.tt.openExternal(
        `https://modrinth.com/mod/${project.slug}/version/${versions[0].id}`,
      );
      toast('Opened compatible NeoForge 26.2 version on Modrinth');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div>
      <h1 className="page-title">Mods</h1>
      <p className="page-sub">
        Only <strong>NeoForge {GAME}</strong> mods are listed. Everything else is hidden.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Installed in .minecraft/mods</div>
        {installed.length === 0 ? (
          <div className="empty">No jars found yet — install TT Client from Play.</div>
        ) : (
          <div className="list">
            {installed.map((m) => (
              <div key={m.path} className="list-item">
                <div className="meta">
                  <strong>{m.name}</strong>
                  <span>
                    {(m.size / 1024).toFixed(0)} KB · {m.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={loadInstalled}>
          Refresh
        </button>
      </div>

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
          placeholder="Search NeoForge 26.2 mods…"
        />
        <button className="btn btn-primary" disabled={loading} onClick={search}>
          Search
        </button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="list">
        {hits.map((h) => (
          <div key={h.project_id} className="list-item">
            {h.icon_url ? <img src={h.icon_url} alt="" /> : <div style={{ width: 48, height: 48 }} />}
            <div className="meta">
              <strong>{h.title}</strong>
              <span>{h.description?.slice(0, 120)}</span>
            </div>
            <button className="btn btn-teal" onClick={() => install(h.project_id)}>
              Get
            </button>
          </div>
        ))}
        {!loading && !hits.length && <div className="empty">No NeoForge {GAME} mods matched.</div>}
      </div>
    </div>
  );
}
