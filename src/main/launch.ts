/**
 * Direct launch — TT Client install + progress events + process kill.
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDefaultInstance, updateInstance, ensureTtInstance } from './instances';
import { getActiveAccount, getLaunchIdentity } from './auth';
import { getStore } from './store';
import { log } from './logger';
import { TT_COMPAT, TtLoader } from './config';
import {
  getDefaultMinecraftDir,
  importOfficialLauncherAccount,
} from './vanilla-mc';
import { installTarget } from './target-install';

let running: ChildProcess | null = null;

export type LaunchProgress = { pct: number; step: string; log: string };

let progressCb: ((p: LaunchProgress) => void) | null = null;

export function setLaunchProgressCallback(cb: ((p: LaunchProgress) => void) | null) {
  progressCb = cb;
}

function report(pct: number, step: string, line: string) {
  try {
    progressCb?.({ pct, step, log: line });
  } catch {
    /* */
  }
  try {
    log.info(`[launch] ${step}: ${line}`);
  } catch {
    /* */
  }
}

export function isRunning(): boolean {
  return !!(running && !running.killed);
}

export function getRunningPid(): number | null {
  return running?.pid ?? null;
}

function findJava(configured?: string): string | null {
  if (configured && fs.existsSync(configured)) return configured;

  const isWin = process.platform === 'win32';
  const javaName = isWin ? 'java.exe' : 'java';
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const localApp = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates: string[] = [];

  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, 'bin', javaName));
  }

  if (isWin && localApp) {
    const mcJavaRoots = [
      path.join(localApp, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'),
      path.join(home, '.minecraft', 'runtime'),
      path.join(localApp, 'MinecraftLauncher', 'runtime'),
      path.join(programFiles, 'Minecraft Launcher', 'runtime'),
      path.join(localApp, 'TLauncher', 'runtime'),
    ];
    for (const root of mcJavaRoots) {
      if (!fs.existsSync(root)) continue;
      try {
        const stack = [root];
        let seen = 0;
        while (stack.length && seen < 250) {
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
            if (e.isFile() && e.name.toLowerCase() === javaName) {
              candidates.push(full);
            } else if (e.isDirectory() && !e.name.startsWith('.')) {
              stack.push(full);
            }
          }
        }
      } catch {
        /* */
      }
    }
  }

  if (isWin) {
    const winRoots = [programFiles, programFilesX86];
    const vendors = [
      'Eclipse Adoptium',
      'Java',
      'Microsoft',
      'Amazon Corretto',
      'Zulu',
      'BellSoft',
      'Temurin',
      'AdoptOpenJDK',
    ];
    for (const root of winRoots) {
      for (const vendor of vendors) {
        const vendorDir = path.join(root, vendor);
        if (!fs.existsSync(vendorDir)) continue;
        try {
          for (const name of fs.readdirSync(vendorDir)) {
            const bin = path.join(vendorDir, name, 'bin', javaName);
            if (fs.existsSync(bin)) candidates.push(bin);
          }
        } catch {
          /* */
        }
      }
    }
  } else {
    candidates.push('/usr/bin/java', '/usr/lib/jvm/default-java/bin/java');
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    try {
      if (fs.existsSync(c)) {
        log.info('Found Java', { path: c });
        return c;
      }
    } catch {
      /* */
    }
  }

  try {
    const cmd = isWin ? 'where java' : 'which java';
    const out = execSync(cmd, { encoding: 'utf8', timeout: 3000, windowsHide: true })
      .trim()
      .split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) {
      log.info('Found Java on PATH', { path: out });
      return out;
    }
  } catch {
    /* not on PATH */
  }

  return null;
}

function findLoaderVersion(
  mcDir: string,
  loader: TtLoader,
  preferredMc?: string,
): { versionDir: string; versionJsonPath: string; versionId: string; versionJson: any } | null {
  const versionsRoot = path.join(mcDir, 'versions');
  if (!fs.existsSync(versionsRoot)) return null;
  const folders = fs
    .readdirSync(versionsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const score = (name: string) => {
    let s = 0;
    const lower = name.toLowerCase();
    if (loader === 'neoforge') {
      if (lower.includes('neoforge')) s += 100;
      else if (lower.includes('forge') && !lower.includes('fabric')) s += 30;
      else return 0;
    } else {
      if (lower.includes('fabric')) s += 100;
      else if (lower.includes('quilt')) s += 40;
      else return 0;
    }
    if (preferredMc && lower.includes(preferredMc.toLowerCase())) s += 80;
    if (preferredMc && lower.startsWith(preferredMc.toLowerCase())) s += 20;
    return s;
  };

  const ranked = folders
    .map((name) => ({ name, score: score(name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.name.localeCompare(a.name));

  for (const { name } of ranked) {
    const jsonPath = path.join(versionsRoot, name, `${name}.json`);
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const versionJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return {
        versionDir: path.join(versionsRoot, name),
        versionJsonPath: jsonPath,
        versionId: name,
        versionJson,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function collectLibraries(versionJson: any, mcDirs: string[]): string[] {
  const jars: string[] = [];
  const libRoots = mcDirs.map((d) => path.join(d, 'libraries'));
  for (const lib of versionJson.libraries || []) {
    const artifact = lib.downloads?.artifact;
    if (!artifact?.path || lib.natives) continue;
    for (const root of libRoots) {
      const p = path.join(root, artifact.path);
      if (fs.existsSync(p)) {
        jars.push(p);
        break;
      }
    }
  }
  return jars;
}

function defaultMainClass(loader: TtLoader, versionJson: any): string {
  if (typeof versionJson.mainClass === 'string' && versionJson.mainClass) return versionJson.mainClass;
  if (loader === 'fabric') return 'net.fabricmc.loader.impl.launch.knot.KnotClient';
  return 'cpw.mods.bootstraplauncher.BootstrapLauncher';
}

export async function launchGame(): Promise<{
  ok: boolean;
  message: string;
  pid?: number;
  needsSetup?: boolean;
}> {
  if (isRunning()) {
    return { ok: false, message: 'Minecraft is already running from TT Launcher.' };
  }

  report(2, 'start', 'Launch requested…');

  const settings = getStore().get('settings') as any;
  const loader = (settings.selectedLoader === 'fabric' ? 'fabric' : 'neoforge') as TtLoader;
  const mcVersion = String(settings.selectedMinecraftVersion || TT_COMPAT.minecraft);

  report(8, 'account', 'Resolving account…');
  let account = getActiveAccount();
  if (!account) account = importOfficialLauncherAccount();
  if (!account) {
    return {
      ok: false,
      message:
        'No account found.\n\nOpen the normal Minecraft Launcher once, sign in with Microsoft, close it, then press Launch again.',
      needsSetup: true,
    };
  }

  report(18, 'install', `Installing TT Client for ${loader} ${mcVersion}…`);
  const installed = installTarget(loader, mcVersion);
  if (!installed.ok) {
    return { ok: false, message: installed.message, needsSetup: true };
  }

  const mcDir = getDefaultMinecraftDir();
  const jarPath = installed.jarPath || null;
  let instance = getDefaultInstance() || ensureTtInstance();
  if (jarPath) {
    instance =
      updateInstance(instance.id, {
        ttClientJar: jarPath,
        ttClientVersion: `${loader}-${mcVersion}`,
        gameDir: mcDir,
        minecraftVersion: mcVersion,
      }) || instance;
  }

  report(40, 'java', 'Looking for Java…');
  const java = findJava(instance.javaPath || settings.javaPath);
  if (java) report(48, 'java', `Java: ${java}`);
  if (!java) {
    return {
      ok: false,
      message:
        'Java not found.\n\nInstall Temurin JDK 21+ from https://adoptium.net/\n' +
        'or open the official Minecraft Launcher once (it installs a Java runtime).\n\n' +
        'You can also set a Java path in Settings.',
      needsSetup: true,
    };
  }

  const identity = getLaunchIdentity(account);
  report(55, 'loader', `Finding ${loader} profile for ${mcVersion}…`);
  const found = findLoaderVersion(mcDir, loader, mcVersion);
  if (!found) {
    const loaderLabel = loader === 'fabric' ? 'Fabric' : 'NeoForge';
    return {
      ok: false,
      message:
        `No ${loaderLabel} install found for Minecraft ${mcVersion} in:\n${path.join(mcDir, 'versions')}\n\n` +
        `Install ${loaderLabel} for ${mcVersion} once, then Launch again.\n\n` +
        (loader === 'neoforge'
          ? 'NeoForge: https://neoforged.net/\n'
          : 'Fabric: https://fabricmc.net/use/installer/\n') +
        `TT was installed to:\n${path.join(mcDir, 'mods')}\n` +
        (installed.message || ''),
      needsSetup: true,
    };
  }

  const { versionDir, versionId, versionJson } = found;
  const mainClass = defaultMainClass(loader, versionJson);
  report(70, 'libs', `Building classpath (${versionId})…`);
  const jars = collectLibraries(versionJson, [mcDir]);
  const clientJar = path.join(versionDir, `${versionId}.jar`);
  if (fs.existsSync(clientJar)) jars.push(clientJar);

  if (jars.length < 5) {
    return {
      ok: false,
      message:
        'Minecraft libraries look incomplete.\n\nRun the loader installer once so libraries download, then Launch again.\n\n' +
        `Version detected: ${versionId}`,
      needsSetup: true,
    };
  }

  const classpath = jars.join(process.platform === 'win32' ? ';' : ':');
  const mem = instance.memoryMb || settings.memoryMb || 4096;
  const nativesDir = path.join(versionDir, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });

  const args = [
    `-Xmx${mem}M`,
    `-Xms${Math.min(1024, mem)}M`,
    `-Djava.library.path=${nativesDir}`,
    ...(instance.jvmArgs || settings.jvmArgs || '').split(/\s+/).filter(Boolean),
    '-cp',
    classpath,
    mainClass,
    '--username',
    identity.username,
    '--uuid',
    identity.uuid,
    '--accessToken',
    identity.accessToken || '0',
    '--version',
    versionId,
    '--gameDir',
    mcDir,
    '--assetsDir',
    path.join(mcDir, 'assets'),
    '--assetIndex',
    versionJson.assetIndex?.id || versionJson.assets || '1.21',
    '--userType',
    identity.offline ? 'legacy' : 'msa',
    '--versionType',
    'TT-Launcher',
  ];

  report(88, 'spawn', `Starting game process (${mainClass})…`);
  log.info('Direct spawn', {
    java,
    mainClass,
    versionId,
    loader,
    mcVersion,
    gameDir: mcDir,
    libs: jars.length,
  });

  let child: ChildProcess;
  try {
    child = spawn(java, args, {
      cwd: mcDir,
      env: { ...process.env },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    log.error('spawn failed', { msg, java });
    return {
      ok: false,
      message:
        `Could not start Java:\n${msg}\n\n` +
        `Install Temurin JDK 21+ from https://adoptium.net/\n` +
        `or open the official Minecraft Launcher once.`,
      needsSetup: true,
    };
  }

  running = child;

  const spawnError = await new Promise<string | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 1500);
    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(err?.message || String(err));
    });
    child.once('spawn', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
  });

  if (spawnError) {
    running = null;
    log.error('Java process error', { spawnError, java });
    return {
      ok: false,
      message:
        `Java failed to start (${spawnError}).\n\n` +
        `Install Temurin JDK 21+ from https://adoptium.net/\n` +
        `or open the official Minecraft Launcher once so its Java runtime is installed.\n\n` +
        `You can also set a Java path in Settings.`,
      needsSetup: true,
    };
  }

  child.stdout?.on('data', (d) => log.debug('[mc] ' + d.toString().slice(0, 400)));
  child.stderr?.on('data', (d) => log.warn('[mc-err] ' + d.toString().slice(0, 400)));
  child.on('exit', (code) => {
    log.info('Minecraft exited', { code });
    running = null;
  });
  updateInstance(instance.id, { lastPlayed: Date.now() });
  report(100, 'done', `Game process started (pid ${child.pid}). Minecraft is loading…`);
  return {
    ok: true,
    message:
      `Launching ${loader} ${versionId} (MC ${mcVersion})…\n` +
      (installed.message || '') +
      `\nMods: ${path.join(mcDir, 'mods')}`,
    pid: child.pid,
  };
}

export function stopGame(): void {
  if (running && !running.killed) {
    try {
      running.kill();
    } catch {
      /* */
    }
    running = null;
  }
}

/** Kill Minecraft game + Minecraft Launcher processes. */
export function killAllMinecraftProcesses(): { ok: boolean; message: string; killed: string[] } {
  const killed: string[] = [];
  const isWin = process.platform === 'win32';

  stopGame();
  killed.push('tt-launcher-child');

  const winNames = [
    'javaw.exe',
    'java.exe',
    'Minecraft.exe',
    'MinecraftLauncher.exe',
    'Minecraft.Windows.exe',
    'MinecraftLauncherUpdater.exe',
    'MinecraftLauncherInstallHelper.exe',
  ];

  if (isWin) {
    for (const name of winNames) {
      try {
        execSync(`taskkill /F /IM ${name} /T`, {
          encoding: 'utf8',
          timeout: 8000,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        killed.push(name);
      } catch {
        /* not running */
      }
    }
    try {
      execSync(
        'powershell -NoProfile -Command "Get-Process | Where-Object { $_.ProcessName -match \'Minecraft|MinecraftLauncher|javaw\' } | Stop-Process -Force -ErrorAction SilentlyContinue"',
        { encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      killed.push('powershell-mc-sweep');
    } catch {
      /* */
    }
  } else {
    try {
      execSync("pkill -f '[Mm]inecraft' || true", { encoding: 'utf8', timeout: 5000 });
      execSync("pkill -f 'minecraft-launcher' || true", { encoding: 'utf8', timeout: 5000 });
      killed.push('pkill-minecraft');
    } catch {
      /* */
    }
  }

  log.info('killAllMinecraftProcesses', { killed });
  return {
    ok: true,
    message: `Ended Minecraft / launcher processes.\nKilled targets: ${killed.join(', ') || 'none running'}`,
    killed,
  };
}
