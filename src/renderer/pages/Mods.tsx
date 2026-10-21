import { useEffect, useState } from 'react';

type Props = { instance: any; toast: (s: string) => void };

export default function Mods({ instance, toast }: Props) {
  const [query, setQuery] = useState('neoforge');
  const [hits, setHits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gameVersion = instance?.minecraftVersion || '26.2';

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.tt.modrinthSearch({
        query,
        projectType: 'mod',
        versions: [gameVersion, '1.21.1'],
        loaders: ['neoforge'],
        limit: 24,
        index: 'downloads',
      });
      setHits(res.hits || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    search();
  }, []);

  const install = async (projectId: string) => {
    try {
      // Reuse pack installer path is wrong for mods — download via versions into mods/
      const versions = await window.tt.modrinthVersions(projectId, {
        loaders: ['neoforge'],
        gameVersions: [gameVersion],
      });
      if (!versions?.length) {
        setError('No NeoForge-compatible version for this Minecraft version.');
        return;
      }
      // Install as "pack" path is incorrect; open external for now if no mod install API
      // Dedicated mod install: write to instance mods via main — extend packs or add mods service.
      // Minimal: open Modrinth page
      const project = await window.tt.modrinthProject(projectId);
      await window.tt.openExternal(`https://modrinth.com/mod/${project.slug}`);
      toast('Opened Modrinth page — full in-app mod install uses NeoForge filter; download from site or extend installer.');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div>
      <h1 className="page-title">Mods & Add-ons</h1>
      <p className="page-sub">
        Modrinth search filtered to <strong>NeoForge</strong> for {gameVersion}. Fabric-only mods are excluded.
      </p>

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
          placeholder="Search NeoForge mods…"
        />
        <button className="btn btn-primary" disabled={loading} onClick={search}>
          Search
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => instance && window.tt.openInstanceFolder(instance.id)}
        >
          Open mods folder
        </button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="list">
        {hits.map((h) => (
          <div key={h.project_id} className="list-item">
            {h.icon_url ? <img src={h.icon_url} alt="" /> : <div style={{ width: 48, height: 48 }} />}
            <div className="meta">
              <strong>{h.title}</strong>
              <span>
                {h.downloads?.toLocaleString?.()} downloads · {h.categories?.slice(0, 3).join(', ')}
              </span>
            </div>
            <button className="btn btn-ghost" onClick={() => install(h.project_id)}>
              View / Install
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
