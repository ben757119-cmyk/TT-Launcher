# TT Launcher — The Third

Official desktop launcher for **TT Client** (Minecraft NeoForge 26.2).

**Repo:** https://github.com/ben757119-cmyk/TT-Launcher

## GitHub Actions (Windows .exe)

Workflow: `.github/workflows/build-windows.yml`

- Runs on push to `main` and via **Actions → Build Windows → Run workflow**
- `windows-latest` + Node 20 + `electron-builder`
- Uploads artifact **TT-Launcher-Windows** (`.exe` installer + portable)
- Creates a prerelease `v{run_number}` when packaging succeeds

### Download the build

1. **Actions** → latest **Build Windows** run → download **TT-Launcher-Windows**
2. Or **Releases** for the prerelease `.exe`

### Push full source (required once)

```bash
git clone https://github.com/ben757119-cmyk/TT-Launcher.git
cd TT-Launcher
# Copy full source from TT-Launcher-source.zip over this folder
git add -A
git commit -m "Add full TT Launcher source"
git push origin main
```

That push triggers the Windows build.

## Local build

```bash
npm install
npm run dist
```

## Auth

See AUTH.md — Azure public client ID required for Microsoft login.
