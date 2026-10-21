# TT Launcher — The Third

Official desktop launcher for **TT Client** (Minecraft NeoForge 26.2).

Dark purple/teal UI · instance management · Modrinth resource packs · Microsoft auth · one-click TT install.

## Stack

- **Electron 31** + **React 18** + **TypeScript** + **Vite**
- **electron-builder** → Windows NSIS installer + portable `.exe`
- **Modrinth API** for resource pack / mod discovery
- **msmc** for Microsoft → Xbox → Minecraft auth
- **electron-store** for local settings (no cloud telemetry)

**Why Electron:** full control over a premium custom UI, mature Windows packaging, and existing Node Minecraft auth libraries. A native WPF/WinUI rewrite is possible later; this delivers a complete, buildable product now.

## Requirements (dev)

- Node.js 20+
- Windows 10/11 x64 for the final `.exe` (you can develop UI on other OS)
- JDK 21+ on machines that launch the game
- NeoForge 26.2 installed once via [neoforged.net](https://neoforged.net/)

## Setup

```bash
cd TT-Launcher
npm install
```

### Development

```bash
# Terminal 1 — Vite UI
npx vite

# Terminal 2 — compile electron + run (set VITE_DEV_SERVER_URL)
npm run build:electron
set VITE_DEV_SERVER_URL=http://localhost:5173
npx electron .
```

On Linux/macOS use `export VITE_DEV_SERVER_URL=http://localhost:5173`.

### Production build (Windows)

```bash
npm run dist
```

Outputs under `release/`:

- `TT-Launcher-1.0.0-x64.exe` (NSIS installer)
- portable build when using `npm run dist:portable`

## First-run user flow

1. Install TT Launcher.
2. **Accounts** → paste Azure client ID (see `AUTH.md`) → Sign in with Microsoft.
3. **Instances** → create **TT Client** (or use auto-created instance on install).
4. **Play** → Install TT Client (GitHub release JAR, or **Install from JAR** if repo is private).
5. Install NeoForge 26.2 with the official installer if not already present.
6. **Resource Packs** → search Modrinth → install / enable.
7. **Launch**.

## TT Client release source

Default GitHub: `ben757119-cmyk/TT-Client` (configurable in Settings).

If the repository is **private**, the releases API returns 404 — use **Install from JAR** and drop the built client jar into the instance `mods` folder.

## Important limitations (honest)

| Area | Status |
|------|--------|
| UI shells (Home, Play, Packs, Mods, Instances, Accounts, Settings, About) | Implemented |
| Modrinth search + resource pack install/enable/options.txt | Implemented |
| Instance create/duplicate/delete/folders | Implemented |
| TT install from GitHub releases / local JAR | Implemented |
| Microsoft auth wiring (msmc) | Implemented — **requires your Azure client ID** |
| Full NeoForge library resolution / installer automation | **Partial** — detects existing NeoForge version JSON + libraries; does not replace the official NeoForge installer |
| In-app mod download to `mods/` | Browse + filter NeoForge; full dependency resolver can be extended |
| Launcher self-update | Structure ready; wire release channel when launcher repo exists |

## Security

- HTTPS for Modrinth/GitHub
- No password fields for Microsoft accounts
- Tokens not written to logs
- Resource packs treated as data (zip/jar), never executed
- Path-safe downloads

## License

MIT for launcher code. TT Client itself and third-party packs retain their own licenses.
