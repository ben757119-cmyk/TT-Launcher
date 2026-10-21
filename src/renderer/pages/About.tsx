type Props = { meta: any };

export default function About({ meta }: Props) {
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
          This launcher uses legitimate Microsoft authentication, Modrinth for discovery, and
          GitHub Releases for TT Client artifacts. It does not distribute Mojang game files or
          bypass ownership checks.
        </p>
      </div>
    </div>
  );
}
