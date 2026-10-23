/**
 * Direct launch — loader + Minecraft version chosen on the Home screen.
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDefaultInstance, updateInstance, ensureTtInstance } from './instances';
import { getActiveAccount, getLaunchIdentity } from './auth';
import { getStore } from './store';
import { log } from './logger';
import { TT_COMPAT, TtLoader, ttJarCandidates } from './config';
import {
  getDefaultMinecraftDir,
  installBundledTtIntoMinecraft,
  installBundledPackIntoMinecraft,
  importOfficialLauncherAccount,
  ensureMinecraftLayout,
} from './vanilla-mc';

let running: ChildProcess | null = null;

export function isRunning(): boolean {
  return !!(running && !running.killed);
}

export function getRunningPid(): number | null {
  return running?.pid ?? null;
}

function findJava(configured?: string): string | null {
  if (configured && fs.existsSync(configured)) return configured;
  const candidates =
    process.platform === 'win32'
      ? [
          process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : '',
          'C:\\Program Files\\Java\\jdk-21\\bin\\java.exe',
          'C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe',
          'C:\\Program Files\\Microsoft\\jdk-21\\bin\\java.exe',
          'java',
        ]
      : [process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : '', 'java'];
  for (const c of candidates) {
    if (!c) continue;
    if (c === 'java' || c === 'java.exe') return c;
    if (fs.existsSync(c)) return c;
  }
  return 'java';
}

function resolveTtJar(mcDir: string, loader: TtLoader): string | null {
  const mods = path.join(mcDir, 'mods');
  if (!fs.existsSync(mods)) return null;
  for (const name of ttJarCandidates(loader)) {
    const p = path.join(mods, name);
    if (fs.existsSync(p)) return p;
  }
  try {
    for (const f of fs.readdirSync(mods)) {
      if (/^ttclient.*\.jar$/i.test(f) && !f.endsWith('.disabled')) return path.join(mods, f);
    }
  } catch { /* */ }
  return null;
}

function prepareModsAndPack(loader: TtLoader): { mcDir: string; jarPath: string | null } {
  const mcDir = getDefaultMinecraftDir();
  ensureMinecraftLayout(mcDir);
  let jarPath = resolveTtJar(mcDir, loader);
  if (!jarPath) {
    const bundled = installBundledTtIntoMinecraft(mcDir);
    jarPath = bundled?.jarPath || resolveTtJar(mcDir, loader);
  }
  installBundledPackIntoMinecraft(mcDir);
  const inst = getDefaultInstance();
  if (inst?.ttClientJar && fs.existsSync(inst.ttClientJar)) {
    const src = inst.ttClientJar.replace(/\.disabled$/, '');
    if (fs.existsSync(src)) {
      const dest = path.join(mcDir, 'mods', ttJarCandidates(loader)[0] || 'ttclient.jar');
      try {
        fs.copyFileSync(src, dest);
        jarPath = dest;
      } catch { /* */ }
    }
  }
  return { mcDir, jarPath };
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
  if (isRunning()) return { ok: false, message: 'Minecraft is already running from TT Launcher.' };

  const settings = getStore().get('settings') as any;
  const loader = (settings.selectedLoader === 'fabric' ? 'fabric' : 'neoforge') as TtLoader;
  const mcVersion = String(settings.selectedMinecraftVersion || TT_COMPAT.minecraft);

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

  const { mcDir, jarPath } = prepareModsAndPack(loader);
  let instance = getDefaultInstance() || ensureTtInstance();
  if (jarPath) {
    instance =
      updateInstance(instance.id, {
        ttClientJar: jarPath,
        ttClientVersion: instance.ttClientVersion || 'installed',
        gameDir: mcDir,
        minecraftVersion: mcVersion,
      }) || instance;
  }

  const java = findJava(instance.javaPath || settings.javaPath);
  if (!java) {
    return {
      ok: false,
      message: 'Java not found. Install Temurin/Oracle JDK 21+ and set the path in Settings.',
      needsSetup: true,
    };
  }

  const identity = getLaunchIdentity(account);
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
        `Mods folder: ${path.join(mcDir, 'mods')}`,
      needsSetup: true,
    };
  }

  const { versionDir, versionId, versionJson } = found;
  const mainClass = defaultMainClass(loader, versionJson);
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

  log.info('Direct spawn', { java, mainClass, versionId, loader, mcVersion, gameDir: mcDir, libs: jars.length });
  const child = spawn(java, args, {
    cwd: mcDir,
    env: { ...process.env },
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  running = child;
  child.stdout?.on('data', (d) => log.debug('[mc] ' + d.toString().slice(0, 400)));
  child.stderr?.on('data', (d) => log.warn('[mc-err] ' + d.toString().slice(0, 400)));
  child.on('exit', (code) => {
    log.info('Minecraft exited', { code });
    running = null;
  });
  updateInstance(instance.id, { lastPlayed: Date.now() });
  return {
    ok: true,
    message: `Launching ${loader} ${versionId} (MC ${mcVersion})…\nMods: ${path.join(mcDir, 'mods')}`,
    pid: child.pid,
  };
}

export function stopGame(): void {
  if (running && !running.killed) {
    try { running.kill(); } catch { /* */ }
    running = null;
  }
}
