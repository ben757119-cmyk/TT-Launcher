/**
 * Managed runtimes — isolated under %LOCALAPPDATA%/TT-Client (survives launcher reinstalls).
 * Does NOT install system-wide Java or modify PATH / registry.
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import https from 'https';
import { downloadFile } from './download';
import { log } from './logger';
import { getDefaultMinecraftDir } from './vanilla-mc';

export type BootstrapProgress = { pct: number; step: string; log: string };

function stableDataRoot(): string {
  if (process.platform === 'win32') {
    const base =
      process.env.LOCALAPPDATA ||
      process.env.APPDATA ||
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    return path.join(base, 'TT-Client');
  }
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'TT-Client');
  }
  return path.join(process.env.HOME || '', '.local', 'share', 'TT-Client');
}

export function runtimesDir(): string {
  return path.join(stableDataRoot(), 'runtimes');
}

export function cacheDir(): string {
  return path.join(stableDataRoot(), 'cache');
}

function report(
  cb: ((p: BootstrapProgress) => void) | undefined,
  pct: number,
  step: string,
  line: string,
) {
  try {
    cb?.({ pct, step, log: line });
  } catch {
    /* */
  }
  log.info(`[bootstrap] ${step}: ${line}`);
}

function httpsGetText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'TT-Launcher/1.7.7' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpsGetText(res.headers.location).then(resolve, reject);
          return;
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function findJavaBinary(root: string): string | null {
  if (!fs.existsSync(root)) return null;
  const isWin = process.platform === 'win32';
  const names = isWin ? ['javaw.exe', 'java.exe'] : ['java'];
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < 400) {
    const dir = stack.pop()!;
    seen++;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && names.includes(e.name) && full.toLowerCase().includes(path.sep + 'bin' + path.sep)) {
        return full;
      } else if (e.isDirectory() && !e.name.startsWith('.')) {
        stack.push(full);
      }
    }
  }
  return null;
}

export function getManagedJavaPath(major: number): string | null {
  const root = path.join(runtimesDir(), 'jdk-' + major);
  const bin = findJavaBinary(root);
  if (!bin) return null;
  const marker = path.join(root, '.tt-ready');
  if (!fs.existsSync(marker)) {
    try {
      fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
    } catch {
      /* */
    }
  }
  return bin;
}

export async function ensureManagedJava(
  major: number,
  onProgress?: (p: BootstrapProgress) => void,
): Promise<{ ok: boolean; javaPath?: string; message: string }> {
  const existing = getManagedJavaPath(major);
  if (existing) {
    report(onProgress, 100, 'java', 'Using cached Java ' + major + ' (no re-download): ' + existing);
    return { ok: true, javaPath: existing, message: 'Managed Java ' + major + ' ready' };
  }

  const root = path.join(runtimesDir(), 'jdk-' + major);
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(cacheDir(), { recursive: true });

  const os =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const api =
    'https://api.adoptium.net/v3/binary/latest/' +
    major +
    '/ga/' +
    os +
    '/' +
    arch +
    '/jdk/hotspot/normal/eclipse?project=jdk';

  const zipPath = path.join(cacheDir(), 'jdk-' + major + '-' + os + '-' + arch + '.zip');

  // Reuse cached zip if present
  if (!fs.existsSync(zipPath)) {
    report(onProgress, 5, 'java', 'Downloading Temurin JDK ' + major + ' (one-time, cached under LocalAppData\\TT-Client)…');
    try {
      await downloadFile(
        api,
        zipPath,
        (p) => {
          if (p.percent != null) {
            report(onProgress, 5 + Math.round((p.percent / 100) * 55), 'java', 'Downloading Java ' + major + '… ' + p.percent + '%');
          }
        },
        600000,
      );
    } catch (e: any) {
      return {
        ok: false,
        message: 'Failed to download Java ' + major + ': ' + (e?.message || e),
      };
    }
  } else {
    report(onProgress, 40, 'java', 'Using cached Java zip (no network download)…');
  }

  report(onProgress, 65, 'java', 'Extracting Java ' + major + '…');
  try {
    execSync('tar -xf "' + zipPath + '" -C "' + root + '"', {
      windowsHide: true,
      timeout: 300000,
      stdio: 'ignore',
    });
  } catch (e: any) {
    return { ok: false, message: 'Failed to extract Java ' + major + ': ' + (e?.message || e) };
  }

  const javaPath = findJavaBinary(root);
  if (!javaPath) {
    return { ok: false, message: 'Java ' + major + ' extracted but binary not found under ' + root };
  }

  try {
    fs.writeFileSync(path.join(root, '.tt-ready'), new Date().toISOString(), 'utf8');
  } catch {
    /* */
  }

  report(onProgress, 100, 'java', 'Managed Java ' + major + ' ready: ' + javaPath);
  return { ok: true, javaPath, message: 'Installed managed Java ' + major };
}

function mcToNeoForgePrefix(mcVersion: string): string {
  const v = String(mcVersion || '').trim();
  const m = v.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (m) return m[1] + '.' + (m[2] ?? '0');
  return v;
}

async function resolveNeoForgeVersion(mcFamily: string): Promise<string | null> {
  try {
    const prefix = mcToNeoForgePrefix(mcFamily);
    const xml = await httpsGetText(
      'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
    );
    const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
    const matched = versions.filter(
      (ver) => ver === prefix || ver.startsWith(prefix + '.') || ver.startsWith(prefix + '-'),
    );
    if (matched.length) {
      matched.sort((a, b) => {
        const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
        const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const d = (pb[i] || 0) - (pa[i] || 0);
          if (d !== 0) return d;
        }
        return 0;
      });
      return matched[0];
    }
  } catch (e) {
    log.warn('NeoForge metadata fetch failed', { err: String(e) });
  }
  return null;
}

function neoforgeAlreadyInstalled(mcDir: string, mcFamily: string): string | null {
  const versionsRoot = path.join(mcDir, 'versions');
  if (!fs.existsSync(versionsRoot)) return null;
  const folders = fs.readdirSync(versionsRoot);
  const prefix = mcToNeoForgePrefix(mcFamily);
  const hit = folders
    .filter((n) => {
      const lower = n.toLowerCase();
      if (!lower.includes('neoforge')) return false;
      return lower.includes(prefix.toLowerCase()) || lower.includes(mcFamily.toLowerCase());
    })
    .sort()
    .reverse();
  return hit[0] || null;
}

export async function ensureNeoForgeClient(
  mcFamily: string,
  javaPath: string,
  onProgress?: (p: BootstrapProgress) => void,
): Promise<{ ok: boolean; versionId?: string; message: string }> {
  const mcDir = getDefaultMinecraftDir();
  const existing = neoforgeAlreadyInstalled(mcDir, mcFamily);
  if (existing) {
    report(onProgress, 100, 'neoforge', 'NeoForge already installed: ' + existing);
    return { ok: true, versionId: existing, message: 'NeoForge present: ' + existing };
  }

  report(onProgress, 10, 'neoforge', 'Looking up NeoForge installer for ' + mcFamily + '…');
  const nfVer = await resolveNeoForgeVersion(mcFamily);
  if (!nfVer) {
    return {
      ok: false,
      message: 'Could not resolve NeoForge for ' + mcFamily + '. Install from https://neoforged.net/',
    };
  }

  const installerUrl =
    'https://maven.neoforged.net/releases/net/neoforged/neoforge/' +
    nfVer +
    '/neoforge-' +
    nfVer +
    '-installer.jar';
  const installerPath = path.join(cacheDir(), 'neoforge-' + nfVer + '-installer.jar');

  if (!fs.existsSync(installerPath)) {
    report(onProgress, 20, 'neoforge', 'Downloading NeoForge ' + nfVer + ' installer…');
    try {
      await downloadFile(installerUrl, installerPath, undefined, 300000);
    } catch (e: any) {
      return { ok: false, message: 'Failed to download NeoForge installer: ' + (e?.message || e) };
    }
  }

  report(onProgress, 65, 'neoforge', 'Running NeoForge installer…');
  let installerJava = javaPath;
  if (installerJava.toLowerCase().endsWith('javaw.exe')) {
    const alt = installerJava.slice(0, -8) + 'java.exe';
    if (fs.existsSync(alt)) installerJava = alt;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(installerJava, ['-jar', installerPath, '--installClient', mcDir], {
        cwd: cacheDir(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let err = '';
      child.stderr?.on('data', (d) => {
        err += d.toString();
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Installer exit ' + code + ': ' + err.slice(-500)));
      });
    });
  } catch (e: any) {
    return { ok: false, message: 'NeoForge installer failed: ' + (e?.message || e) };
  }

  const after = neoforgeAlreadyInstalled(mcDir, mcFamily);
  if (!after) {
    return { ok: false, message: 'Installer finished but NeoForge ' + mcFamily + ' not found.' };
  }
  report(onProgress, 100, 'neoforge', 'NeoForge installed: ' + after);
  return { ok: true, versionId: after, message: 'Installed NeoForge ' + after };
}

export function requiredJavaForMc(mcVersion: string): number {
  const v = String(mcVersion || '');
  if (v.startsWith('26') || v.startsWith('27') || v.startsWith('28')) return 25;
  if (v.startsWith('1.21')) return 21;
  return 21;
}
