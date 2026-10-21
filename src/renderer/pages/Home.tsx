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
    else toast(res.message.slice(0, 100) + (res.message.length > 100 ? '…' : ''));
    onNavigate('play');
  };

  return (
    <div className="home-wrap">
      <div className="hero">
        <div className="hero-badge">
          <span>●</span> NeoForge {meta?.ttCompat?.neoforge || '26.2'} · The Third
        </div>
        <h1>TT Client</h1>
        <p>
          Official launcher for The Third — clean PvP client, one-click install, resource packs,
          and Microsoft login. Built for NeoForge.
        </p>
        <div className="launch-row">
          <button className="btn-launch" onClick={play}>
            ▶  LAUNCH
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('play')}>
            Install / Update
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('accounts')}>
            {account ? account.name : 'Sign in'}
          </button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Account</div>
          <div className={`stat-value ${account ? '' : 'muted'}`}>
            {account ? account.name : 'Not signed in'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Instance</div>
          <div className={`stat-value ${instance ? '' : 'muted'}`}>
            {instance ? instance.name : 'None yet'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TT Client</div>
          <div className="stat-value">
            {instance?.ttClientVersion ? (
              <span className="badge badge-teal">{instance.ttClientVersion}</span>
            ) : (
              <span className="badge badge-warn">Not installed</span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Minecraft</div>
          <div className="stat-value muted">
            {instance?.minecraftVersion || meta?.ttCompat?.minecraft || '26.2'}
          </div>
        </div>
      </div>
    </div>
  );
}
