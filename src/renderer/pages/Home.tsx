type Props = {
  account: any;
  instance: any;
  meta: any;
  onNavigate: (t: any) => void;
  toast: (s: string) => void;
  refresh: () => void;
};

export default function Home({ account, instance, meta, onNavigate, toast, refresh }: Props) {
  const play = async () => {
    const res = await window.tt.play();
    if (res.ok) toast(res.message);
    else toast(res.message.slice(0, 80) + (res.message.length > 80 ? '…' : ''));
    onNavigate('play');
  };

  return (
    <div>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card hero-play">
          <div className="badge badge-purple">NeoForge {meta?.ttCompat?.neoforge || '26.2'}</div>
          <h1>TT Client</h1>
          <p>
            The Third — PvP utility client for Minecraft NeoForge. Launch your instance, manage
            packs, and keep TT updated from one place.
          </p>
          <div className="row">
            <button className="btn btn-teal btn-lg" onClick={play}>
              ▶  Launch
            </button>
            <button className="btn btn-ghost" onClick={() => onNavigate('play')}>
              Install / Update TT
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Current setup</div>
          <dl className="kv">
            <dt>Account</dt>
            <dd>{account ? account.name : '— sign in'}</dd>
            <dt>Instance</dt>
            <dd>{instance ? instance.name : '— create one'}</dd>
            <dt>TT Client</dt>
            <dd>
              {instance?.ttClientVersion ? (
                <span className="badge badge-teal">{instance.ttClientVersion}</span>
              ) : (
                <span className="badge badge-warn">Not installed</span>
              )}
            </dd>
            <dt>Minecraft</dt>
            <dd>{instance?.minecraftVersion || meta?.ttCompat?.minecraft || '—'}</dd>
            <dt>NeoForge</dt>
            <dd>{instance?.neoforgeVersion || meta?.ttCompat?.neoforge || '—'}</dd>
            <dt>Last played</dt>
            <dd>
              {instance?.lastPlayed
                ? new Date(instance.lastPlayed).toLocaleString()
                : 'Never'}
            </dd>
          </dl>
        </div>
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card-title">Quick actions</div>
          <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <button className="btn btn-ghost" onClick={() => onNavigate('accounts')}>
              Accounts
            </button>
            <button className="btn btn-ghost" onClick={() => onNavigate('packs')}>
              Resource packs
            </button>
            <button className="btn btn-ghost" onClick={() => onNavigate('instances')}>
              Instances
            </button>
            <button className="btn btn-ghost" onClick={() => refresh()}>
              Refresh status
            </button>
          </div>
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-title">Notes</div>
          <p style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Live data only — no fake download counts. TT Client releases are loaded from the
            configured GitHub repository. If the repo is private, use <strong>Install from JAR</strong>{' '}
            on the Play page. NeoForge must be installed once via the official installer before the
            first launch.
          </p>
        </div>
      </div>
    </div>
  );
}
