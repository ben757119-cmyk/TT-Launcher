/**
 * Managed runtimes for TT Launcher — isolated under Electron userData.
 * Does NOT install system-wide Java or modify PATH / registry.
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import https from 'https';
import { downloadFile } from './download';
import { log } from './logger';
import { getDefaultMinecraftDir } from './vanilla-mc';

export type BootstrapProgress = { pct: number; step: string; log: string };

function userDataRoot(): string {
  try {
    return app.getPath('userData');
  } catch {
    return path.join(process.env.APPDATA || process.env.HOME || '.', 'TT-Launcher');
  }
}

export function runtimesDir(): string {
  return path.join(userDataRoot(), 'runtimes');
}

export function cacheDir(): string {
  return path.join(userDataRoot(), 'cache');
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
      .get(url, { headers: { 'User-Agent': 'TT-Launcher/1.7.6' } }, (res) => {
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
  const stack2 = [root];
  seen = 0;
  while (stack2.length && seen < 400) {
    const dir = stack2.pop()!;
    seen++;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && names.includes(e.name)) return full;
      if (e.isDirectory() && !e.name.startsWith('.')) stack2.push(full);
    }
  }
  return null;
}

export function getManagedJavaPath(major: number): string | null {
  const root = path.join(runtimesDir(), 'jdk-' + major);
  const marker = path.join(root, '.tt-ready');
  if (!fs.existsSync(marker)) return null;
  return findJavaBinary(root);
}

export async function ensureManagedJava(
  major: number,
  onProgress?: (p: BootstrapProgress) => void,
): Promise<{ ok: boolean; javaPath?: string; message: string }> {
  const existing = getManagedJavaPath(major);
  if (existing) {
    report(onProgress, 100, 'java', 'Using managed Java ' + major + ': ' + existing);
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

  report(onProgress, 5, 'java', 'Downloading Temurin JDK ' + major + ' (managed, TT folder only)…');

  try {
    await downloadFile(
      api,
      zipPath,
      (p) => {
        if (p.percent != null) {
          report(
            onProgress,
            5 + Math.round((p.percent / 100) * 55),
            'java',
            'Downloading Java ' + major + '… ' + p.percent + '%',
          );
        }
      },
      600000,
    );
  } catch (e: any) {
    return {
      ok: false,
      message:
        'Failed to download Java ' +
        major +
        ': ' +
        (e?.message || e) +
        '\nInstall Temurin ' +
        major +
        ' from https://adoptium.net/',
    };
  }

  report(onProgress, 65, 'java', 'Extracting Java ' + major + ' into TT Launcher folder…');
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

/** MC 1.21.1 → 21.1 | MC 1.21 → 21.0 | MC 26.2 → 26.2 */
function mcToNeoForgePrefix(mcVersion: string): string {
  const v = String(mcVersion || '').trim();
  const m = v.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (m) {
    return m[1] + '.' + (m[2] ?? '0');
  }
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
    log.warn('No NeoForge versions matched prefix', { mcFamily, prefix, sample: versions.slice(-5) });
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
      const pref = prefix.toLowerCase();
      const fam = mcFamily.toLowerCase();
      // Strict: 26.2 must not match 26.1
      if (lower.includes(pref)) return true;
      if (lower.includes(fam)) return true;
      return false;
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
      message:
        'Could not resolve NeoForge for ' +
        mcFamily +
        ' (prefix ' +
        mcToNeoForgePrefix(mcFamily) +
        ').\nInstall from https://neoforged.net/ once.',
    };
  }

  const installerUrl =
    'https://maven.neoforged.net/releases/net/neoforged/neoforge/' +
    nfVer +
    '/neoforge-' +
    nfVer +
    '-installer.jar';
  const installerPath = path.join(cacheDir(), 'neoforge-' + nfVer + '-installer.jar');

  report(onProgress, 20, 'neoforge', 'Downloading NeoForge ' + nfVer + ' installer…');
  try {
    await downloadFile(
      installerUrl,
      installerPath,
      (p) => {
        if (p.percent != null) {
          report(
            onProgress,
            20 + Math.round((p.percent / 100) * 40),
            'neoforge',
            'Downloading installer… ' + p.percent + '%',
          );
        }
      },
      300000,
    );
  } catch (e: any) {
    return {
      ok: false,
      message: 'Failed to download NeoForge installer: ' + (e?.message || e),
    };
  }

  report(onProgress, 65, 'neoforge', 'Running NeoForge installer (client → .minecraft)…');
  let installerJava = javaPath;
  if (installerJava.toLowerCase().endsWith('javaw.exe')) {
    const alt = installerJava.slice(0, -8) + 'java.exe';
    if (fs.existsSync(alt)) installerJava = alt;
  }
  const args = ['-jar', installerPath, '--installClient', mcDir];
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(installerJava, args, {
        cwd: cacheDir(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let err = '';
      child.stderr?.on('data', (d) => {
        err += d.toString();
        report(onProgress, 75, 'neoforge', d.toString().trim().slice(0, 180));
      });
      child.stdout?.on('data', (d) => {
        report(onProgress, 75, 'neoforge', d.toString().trim().slice(0, 180));
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Installer exit ' + code + ': ' + err.slice(-500)));
      });
    });
  } catch (e: any) {
    return {
      ok: false,
      message: 'NeoForge installer failed: ' + (e?.message || e),
    };
  }

  const after = neoforgeAlreadyInstalled(mcDir, mcFamily);
  if (!after) {
    return {
      ok: false,
      message: 'Installer finished but NeoForge ' + mcFamily + ' was not found in versions/.',
    };
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
