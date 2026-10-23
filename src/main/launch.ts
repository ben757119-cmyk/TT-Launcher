/**
 * Direct launch into Minecraft/NeoForge using the user's .minecraft install.
 * Does NOT open the official launcher UI.
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDefaultInstance, updateInstance, ensureTtInstance } from './instances';
import { getActiveAccount, getLaunchIdentity } from './auth';
import { getStore } from './store';
import { log } from './logger';
import { TT_COMPAT } from './config';
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

function prepareModsAndPack(): { mcDir: string; jarPath: string | null } {
  const mcDir = getDefaultMinecraftDir();
  ensureMinecraftLayout(mcDir);
  let jarPath: string | null = path.join(mcDir, 'mods', 'ttclient.jar');
  if (!fs.existsSync(jarPath)) {
    const bundled = installBundledTtIntoMinecraft(mcDir);
    jarPath = bundled?.jarPath || null;
  }
  installBundledPackIntoMinecraft(mcDir);
  const inst = getDefaultInstance();
  if (inst?.ttClientJar && fs.existsSync(inst.ttClientJar)) {
    const src = inst.ttClientJar.replace(/\.disabled$/, '');
    if (fs.existsSync(src)) {
      const dest = path.join(mcDir, 'mods', 'ttclient.jar');
      try {
        fs.copyFileSync(src, dest);
        jarPath = dest;
      } catch {
        /* */
      }
    }
  }
  return { mcDir, jarPath: jarPath && fs.existsSync(jarPath) ? jarPath : null };
}

function findNeoForgeVersion(
  mcDir: string,
  preferredNf?: string,
  preferredMc?: string,
): {
  versionDir: string;
  versionJsonPath: string;
  versionId: string;
  versionJson: any;
} | null {
  const versionsRoot = path.join(mcDir, 'versions');
  if (!fs.existsSync(versionsRoot)) return null;
  const folders = fs
    .readdirSync(versionsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const score = (name: string) => {
    let s = 0;
    const lower = name.toLowerCase();
    if (lower.includes('neoforge')) s += 100;
    if (lower.includes('forge') && !lower.includes('neoforge')) s += 40;
    if (preferredNf && lower.includes(preferredNf.toLowerCase())) s += 50;
    if (preferredMc && lower.includes(preferredMc.toLowerCase())) s += 30;
    if (lower.includes('26.2') || lower.includes('1.21')) s += 10;
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
    if (!artifact?.path) continue;
    if (lib.natives) continue;
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

export async function launchGame(): Promise<{
  ok: boolean;
  message: string;
  pid?: number;
  needsSetup?: boolean;
}> {
  if (isRunning()) {
    return { ok: false, message: 'Minecraft is already running from TT Launcher.' };
  }

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

  const { mcDir, jarPath } = prepareModsAndPack();
  let instance = getDefaultInstance() || ensureTtInstance();
  if (jarPath) {
    instance =
      updateInstance(instance.id, {
        ttClientJar: jarPath,
        ttClientVersion: instance.ttClientVersion || 'installed',
        gameDir: mcDir,
      }) || instance;
  }

  const settings = getStore().get('settings');
  const java = findJava(instance.javaPath || settings.javaPath);
  if (!java) {
    return {
      ok: false,
      message: 'Java not found. Install Temurin/Oracle JDK 21+ and set the path in Settings.',
      needsSetup: true,
    };
  }

  const identity = getLaunchIdentity(account);
  const found = findNeoForgeVersion(mcDir, instance.neoforgeVersion, instance.minecraftVersion);
  if (!found) {
    return {
      ok: false,
      message:
        `No NeoForge install found in:\n${path.join(mcDir, 'versions')}\n\n` +
        `Install NeoForge ${TT_COMPAT.neoforge} once from https://neoforged.net/ (Install client), then Launch again.\n\n` +
        `TT Client is ready in:\n${path.join(mcDir, 'mods')}`,
      needsSetup: true,
    };
  }

  const { versionDir, versionId, versionJson } = found;
  const mainClass =
    typeof versionJson.mainClass === 'string'
      ? versionJson.mainClass
      : 'cpw.mods.bootstraplauncher.BootstrapLauncher';

  const jars = collectLibraries(versionJson, [mcDir]);
  const clientJar = path.join(versionDir, `${versionId}.jar`);
  if (fs.existsSync(clientJar)) jars.push(clientJar);

  if (jars.length < 5) {
    return {
      ok: false,
      message:
        'Minecraft libraries look incomplete.\n\nRun the NeoForge installer once so libraries download, then Launch again.\n\n' +
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

  log.info('Direct spawn Minecraft', { java, mainClass, versionId, gameDir: mcDir, libs: jars.length });
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
    message: `Launching ${versionId}…\nMods folder: ${path.join(mcDir, 'mods')}`,
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
