/**
 * Minecraft process launch.
 *
 * Full NeoForge bootstrap (installer, library resolution, version JSON) is complex.
 * This module:
 *  1. Prefers launching via an existing Prism/official-style instance if the user points at one
 *  2. Provides a documented NeoForge install path
 *  3. Spawns Java with classic game args when a complete classpath is available
 *
 * For production TT installs, the recommended path is:
 *  - Create instance folders (done)
 *  - Use NeoForge installer once per MC version OR
 *  - Detect user's existing .minecraft NeoForge 26.2 installation and add TT jar to mods
 *
 * We implement "attach TT to detected NeoForge" + process spawn tracking.
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDefaultInstance, updateInstance } from './instances';
import { getActiveAccount, getLaunchIdentity } from './auth';
import { getStore } from './store';
import { log } from './logger';
import { TT_COMPAT } from './config';

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
          'C:\\\\Program Files\\\\Java\\\\jdk-21\\\\bin\\\\java.exe',
          'C:\\\\Program Files\\\\Eclipse Adoptium\\\\jdk-21\\\\bin\\\\java.exe',
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

/**
 * Attempt launch. Returns structured result.
 * If NeoForge classpath is not fully resolved, returns instructions instead of a fake success.
 */
export async function launchGame(): Promise<{
  ok: boolean;
  message: string;
  pid?: number;
  needsSetup?: boolean;
}> {
  if (isRunning()) {
    return { ok: false, message: 'Minecraft is already running from TT Launcher.' };
  }

  const account = getActiveAccount();
  if (!account) {
    return { ok: false, message: 'Sign in with a Microsoft account first (Accounts).' };
  }

  const instance = getDefaultInstance();
  if (!instance) {
    return { ok: false, message: 'Create or select an instance first.' };
  }

  if (!instance.ttClientJar || !fs.existsSync(instance.ttClientJar)) {
    return {
      ok: false,
      message: 'TT Client is not installed on this instance. Use Play → Install TT Client.',
      needsSetup: true,
    };
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
  if (!identity.offline && (!identity.accessToken || identity.accessToken === '0')) {
    return {
      ok: false,
      message:
        'Microsoft session token missing or expired. Sign in again under Accounts. ' +
        'Ensure Azure client ID is configured (see AUTH.md).',
      needsSetup: true,
    };
  }

  // Look for NeoForge version JSON under instance or user .minecraft
  const versionIdCandidates = [
    `neoforge-${instance.neoforgeVersion}`,
    `${instance.minecraftVersion}-neoforge-${instance.neoforgeVersion}`,
    instance.minecraftVersion,
  ];

  const mcDirs = [
    instance.gameDir,
    path.join(require('os').homedir(), 'AppData', 'Roaming', '.minecraft'),
    path.join(require('os').homedir(), '.minecraft'),
  ];

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
    const msg =
      `NeoForge ${TT_COMPAT.neoforge} is not installed in the instance or .minecraft/versions.\n\n` +
      `Do this once:\n` +
      `1. Download NeoForge ${TT_COMPAT.neoforge} installer for Minecraft ${TT_COMPAT.minecraft}\n` +
      `   from https://neoforged.net/\n` +
      `2. Run the installer → Install client\n` +
      `3. Copy the generated version folder into the instance or use the shared .minecraft\n` +
      `4. Place TT Client JAR in the instance mods folder (Install TT Client button)\n` +
      `5. Press Play again\n\n` +
      `TT Launcher prepared instance at:\n${instance.gameDir}`;
    log.warn('Launch blocked: NeoForge version JSON missing');
    return { ok: false, message: msg, needsSetup: true };
  }

  // Minimal spawn: many production launchers resolve full classpath from version JSON + libraries.
  // We spawn with a helper script approach: write a launch marker and open instructions if classpath incomplete.
  // For environments where libraries exist under .minecraft/libraries, attempt classic launch.

  const versionDir = path.dirname(versionJsonPath);
  const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
  const mainClass =
    versionJson.mainClass ||
    versionJson.arguments?.jvm ||
    'cpw.mods.bootstraplauncher.BootstrapLauncher';

  // Build library classpath (simplified — production should use full library manager)
  const libRoots = mcDirs.map((d) => path.join(d, 'libraries'));
  const jars: string[] = [];
  const libs = versionJson.libraries || [];
  for (const lib of libs) {
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
  // Client jar
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
    return {
      ok: false,
      message:
        'Minecraft/NeoForge libraries are incomplete in the detected folders. ' +
        'Run the official NeoForge installer once so libraries download, then retry Play.\n\n' +
        `Instance: ${instance.gameDir}\nVersion JSON: ${versionJsonPath}`,
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
    typeof mainClass === 'string' ? mainClass : 'cpw.mods.bootstraplauncher.BootstrapLauncher',
    '--username',
    identity.username,
    '--uuid',
    identity.uuid,
    '--accessToken',
    identity.accessToken,
    '--version',
    path.basename(versionDir),
    '--gameDir',
    instance.gameDir,
    '--assetsDir',
    path.join(mcDirs.find((d) => fs.existsSync(path.join(d, 'assets'))) || mcDirs[0], 'assets'),
    '--assetIndex',
    versionJson.assetIndex?.id || versionJson.assets || '1.21',
    '--userType',
    identity.offline ? 'legacy' : 'msa',
    '--versionType',
    'TT-Launcher',
  ];

  log.info('Spawning Minecraft', { java, mainClass, gameDir: instance.gameDir });
  const child = spawn(java, args, {
    cwd: instance.gameDir,
    env: { ...process.env },
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  running = child;
  child.stdout?.on('data', (d) => log.debug('[mc] ' + d.toString().slice(0, 500)));
  child.stderr?.on('data', (d) => log.warn('[mc-err] ' + d.toString().slice(0, 500)));
  child.on('exit', (code) => {
    log.info('Minecraft exited', { code });
    running = null;
  });

  updateInstance(instance.id, { lastPlayed: Date.now() });

  return {
    ok: true,
    message: 'Launching Minecraft…',
    pid: child.pid,
  };
}

export function stopGame(): void {
  if (running && !running.killed) {
    running.kill();
    running = null;
  }
}
