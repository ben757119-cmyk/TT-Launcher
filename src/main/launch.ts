/**
 * Launch strategy (practical):
 * 1. Drop TT Client + resource pack into the user's normal .minecraft
 * 2. Prefer opening the official Minecraft Launcher (uses their real account)
 * 3. Only attempt a direct Java/NeoForge spawn if a full install is already present
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { shell } from 'electron';
import { getDefaultInstance, updateInstance, ensureTtInstance } from './instances';
import { getActiveAccount, getLaunchIdentity, signInOffline } from './auth';
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

function findOfficialLauncher(): string | null {
  if (process.platform !== 'win32') return null;
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates = [
    path.join(local, 'Programs', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    path.join(pf86, 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    path.join(pf, 'Minecraft Launcher', 'MinecraftLauncher.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function prepareModsAndPack(): { mcDir: string; jarOk: boolean } {
  const mcDir = getDefaultMinecraftDir();
  ensureMinecraftLayout(mcDir);
  const jar = installBundledTtIntoMinecraft(mcDir);
  installBundledPackIntoMinecraft(mcDir);
  const inst = getDefaultInstance();
  if (inst?.ttClientJar && fs.existsSync(inst.ttClientJar)) {
    const dest = path.join(mcDir, 'mods', path.basename(inst.ttClientJar).replace(/\.disabled$/, ''));
    try {
      fs.copyFileSync(inst.ttClientJar.replace(/\.disabled$/, ''), dest);
    } catch {
      /* ignore */
    }
  }
  return {
    mcDir,
    jarOk: !!jar || !!(inst?.ttClientJar && fs.existsSync(inst.ttClientJar)),
  };
}

function ensureAnyAccount() {
  let account = getActiveAccount();
  if (!account) account = importOfficialLauncherAccount();
  if (!account) {
    account = signInOffline('Player');
    log.info('Created fallback offline account Player');
  }
  return account;
}

async function openOfficialLauncher(mcDir: string): Promise<{
  ok: boolean;
  message: string;
  pid?: number;
  needsSetup?: boolean;
}> {
  const exe = findOfficialLauncher();
  if (exe) {
    log.info('Opening official Minecraft Launcher', { exe, mcDir });
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(exe),
    });
    child.unref();
    running = child;
    return {
      ok: true,
      message:
        'Opened the official Minecraft Launcher.\n\n' +
        '1. Pick your NeoForge / Minecraft profile\n' +
        '2. TT is installed into .minecraft\\mods\n' +
        '3. Press Play in the official launcher\n\n' +
        `Folder: ${mcDir}`,
      pid: child.pid,
    };
  }

  try {
    if (process.platform === 'win32') {
      await shell.openPath(
        'shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft',
      );
      return {
        ok: true,
        message:
          'Tried to open the Microsoft Store Minecraft Launcher.\n' +
          `TT Client was installed into:\n${path.join(mcDir, 'mods')}\n\n` +
          'If nothing opened, start Minecraft from the Start menu, then Play.',
      };
    }
  } catch (e) {
    log.warn('shell open store launcher failed', { err: String(e) });
  }

  try {
    await shell.openPath(path.join(mcDir, 'mods'));
  } catch {
    /* ignore */
  }

  return {
    ok: false,
    message:
      'Could not find the official Minecraft Launcher on this PC.\n\n' +
      'Install Minecraft from the Microsoft Store or minecraft.net, sign in there, then try Launch again.\n\n' +
      `We still installed TT files into:\n${mcDir}\\mods\n${mcDir}\\resourcepacks`,
    needsSetup: true,
  };
}

export async function launchGame(): Promise<{
  ok: boolean;
  message: string;
  pid?: number;
  needsSetup?: boolean;
}> {
  if (isRunning()) {
    running = null;
  }

  ensureAnyAccount();
  const { mcDir, jarOk } = prepareModsAndPack();

  let instance = getDefaultInstance() || ensureTtInstance();
  const jarPath = path.join(mcDir, 'mods', 'ttclient.jar');
  if (fs.existsSync(jarPath)) {
    instance =
      updateInstance(instance.id, {
        ttClientJar: jarPath,
        ttClientVersion: instance.ttClientVersion || 'bundled',
        gameDir: mcDir,
      }) || instance;
  }

  const settings = getStore().get('settings') as any;
  if (settings.preferOfficialLauncher !== false) {
    const result = await openOfficialLauncher(mcDir);
    if (result.ok) {
      updateInstance(instance.id, { lastPlayed: Date.now() });
      return result;
    }
  }

  if (!jarOk && !fs.existsSync(jarPath)) {
    return {
      ok: false,
      message:
        'TT Client JAR is not installed.\n\n' +
        'Play → Install from JAR… and pick your real ttclient.jar, then Launch again.',
      needsSetup: true,
    };
  }

  const java = findJava(instance.javaPath || settings.javaPath);
  if (!java) {
    return {
      ok: false,
      message: 'Java not found. Use the official Minecraft Launcher, or install Temurin JDK 21+.',
      needsSetup: true,
    };
  }

  const account = ensureAnyAccount();
  const identity = getLaunchIdentity(account);

  const versionIdCandidates = [
    `neoforge-${instance.neoforgeVersion}`,
    `${instance.minecraftVersion}-neoforge-${instance.neoforgeVersion}`,
    instance.minecraftVersion,
  ];
  const mcDirs = [mcDir, instance.gameDir];

  let versionJsonPath: string | null = null;
  for (const root of mcDirs) {
    for (const vid of versionIdCandidates) {
      const p = path.join(root, 'versions', vid, `${vid}.json`);
      if (fs.existsSync(p)) {
        versionJsonPath = p;
        break;
      }
    }
    if (versionJsonPath) break;
  }

  if (!versionJsonPath) {
    const opened = await openOfficialLauncher(mcDir);
    if (opened.ok) return opened;
    return {
      ok: false,
      message:
        `NeoForge ${TT_COMPAT.neoforge} not found under .minecraft\\versions.\n\n` +
        `1. Install NeoForge from https://neoforged.net/ (Install client)\n` +
        `2. Open the normal Minecraft Launcher and Play that profile\n` +
        `3. TT is already in: ${path.join(mcDir, 'mods')}`,
      needsSetup: true,
    };
  }

  const versionDir = path.dirname(versionJsonPath);
  const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
  const mainClass =
    typeof versionJson.mainClass === 'string'
      ? versionJson.mainClass
      : 'cpw.mods.bootstraplauncher.BootstrapLauncher';

  const libRoots = mcDirs.map((d) => path.join(d, 'libraries'));
  const jars: string[] = [];
  for (const lib of versionJson.libraries || []) {
    const artifact = lib.downloads?.artifact;
    if (!artifact?.path) continue;
    for (const root of libRoots) {
      const p = path.join(root, artifact.path);
      if (fs.existsSync(p)) {
        jars.push(p);
        break;
      }
    }
  }
  for (const root of mcDirs) {
    const clientJar = path.join(
      root,
      'versions',
      path.basename(versionDir),
      `${path.basename(versionDir)}.jar`,
    );
    if (fs.existsSync(clientJar)) jars.push(clientJar);
  }

  if (jars.length < 5) {
    const opened = await openOfficialLauncher(mcDir);
    if (opened.ok) return opened;
    return {
      ok: false,
      message:
        'Minecraft libraries incomplete. Run the NeoForge installer once, then use the official Minecraft Launcher to Play.',
      needsSetup: true,
    };
  }

  const classpath = jars.join(process.platform === 'win32' ? ';' : ':');
  const mem = instance.memoryMb || settings.memoryMb || 4096;
  const args = [
    `-Xmx${mem}M`,
    `-Xms${Math.min(1024, mem)}M`,
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
    path.basename(versionDir),
    '--gameDir',
    mcDir,
    '--assetsDir',
    path.join(mcDirs.find((d) => fs.existsSync(path.join(d, 'assets'))) || mcDir, 'assets'),
    '--assetIndex',
    versionJson.assetIndex?.id || versionJson.assets || '1.21',
    '--userType',
    identity.offline ? 'legacy' : 'msa',
    '--versionType',
    'TT-Launcher',
  ];

  log.info('Spawning Minecraft directly', { java, mainClass, gameDir: mcDir });
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
  return { ok: true, message: 'Launching Minecraft…', pid: child.pid };
}

export function stopGame(): void {
  if (running && !running.killed) {
    try {
      running.kill();
    } catch {
      /* ignore */
    }
    running = null;
  }
}
