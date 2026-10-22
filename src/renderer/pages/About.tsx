type Props = { meta: any };

export default function About({ meta }: Props) {
  const owner = meta?.owner || {
    name: 'The_Algorithm67',
    email: 'ben757119@gmail.com',
    discord: '@pyforge_',
  };

  return (
    <div>
      <h1 className="page-title">About TT</h1>
      <p className="page-sub">The Third — TT Client and TT Launcher.</p>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="brand" style={{ paddingLeft: 0 }}>
          <div className="brand-mark">TT</div>
          <div className="brand-text">
            <strong>TT Launcher {meta?.launcherVersion}</strong>
            <span>Desktop launcher for TT Client</span>
          </div>
        </div>
        <dl className="kv" style={{ marginTop: 16 }}>
          <dt>Main owner</dt>
          <dd>{owner.name}</dd>
          <dt>Help / support</dt>
          <dd>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.tt.openExternal(`mailto:${owner.email}`);
              }}
            >
              {owner.email}
            </a>
          </dd>
          <dt>Discord</dt>
          <dd>{owner.discord}</dd>
          <dt>Target</dt>
          <dd>
            Minecraft {meta?.ttCompat?.minecraft} · NeoForge {meta?.ttCompat?.neoforge}
          </dd>
          <dt>Website</dt>
          <dd>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.tt.openExternal(meta?.website || 'https://tt-client-oogley.vercel.app');
              }}
            >
              {meta?.website}
            </a>
          </dd>
          <dt>Meaning</dt>
          <dd>TT = The Third</dd>
        </dl>
        <p style={{ marginTop: 16, color: 'var(--text-dim)', lineHeight: 1.55 }}>
          Uses your normal <code>.minecraft</code> folder (mods + resource packs) and can import the
          account already signed into the official Minecraft Launcher. For help, email{' '}
          {owner.email} or Discord {owner.discord}.
        </p>
      </div>
    </div>
  );
}
