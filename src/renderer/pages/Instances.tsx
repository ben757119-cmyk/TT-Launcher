import { useEffect, useState } from 'react';

type Props = { toast: (s: string) => void; refresh: () => void };

export default function Instances({ toast, refresh }: Props) {
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState('TT Client');
  const [error, setError] = useState<string | null>(null);

  const load = async () => setList(await window.tt.listInstances());

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setError(null);
    try {
      await window.tt.createInstance({ name });
      toast('Instance created');
      await load();
      refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div>
      <h1 className="page-title">Instances</h1>
      <p className="page-sub">Separate game directories for testing without breaking your main TT install.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Create instance</div>
        <div className="row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-0)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              padding: '10px 12px',
            }}
            placeholder="Instance name"
          />
          <button className="btn btn-primary" onClick={create}>
            Create
          </button>
        </div>
        {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      <div className="list">
        {list.map((i) => (
          <div key={i.id} className="list-item">
            <div className="meta">
              <strong>{i.name}</strong>
              <span>
                MC {i.minecraftVersion} · NeoForge {i.neoforgeVersion} · {i.memoryMb} MB
                {i.ttClientVersion ? ` · TT ${i.ttClientVersion}` : ''}
              </span>
            </div>
            <button
              className="btn btn-teal"
              onClick={async () => {
                await window.tt.setDefaultInstance(i.id);
                toast('Default instance set');
                refresh();
              }}
            >
              Use
            </button>
            <button className="btn btn-ghost" onClick={() => window.tt.openInstanceFolder(i.id)}>
              Folder
            </button>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await window.tt.duplicateInstance(i.id, i.name + ' Copy');
                load();
              }}
            >
              Duplicate
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (confirm(`Delete instance "${i.name}"? Files can be removed.`)) {
                  const wipe = confirm('Also delete game files on disk?');
                  await window.tt.deleteInstance(i.id, wipe);
                  load();
                  refresh();
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
        {!list.length && <div className="empty">No instances yet — create one above</div>}
      </div>
    </div>
  );
}
