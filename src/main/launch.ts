/**
 * Full launch pipeline for NeoForge / Fabric.
 * Resolves version inheritance, natives, JVM + game args from version.json.
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
  const preferredNames = isWin ? ['javaw.exe', 'java.exe'] : ['java'];
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const localApp = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates: string[] = [];

  if (process.env.JAVA_HOME) {
    for (const n of preferredNames) {
      candidates.push(path.join(process.env.JAVA_HOME, 'bin', n));
    }
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
        while (stack.length && seen < 300) {
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
            if (e.isFile() && preferredNames.includes(e.name.toLowerCase())) {
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
    for (const root of [programFiles, programFilesX86]) {
      for (const vendor of [
        'Eclipse Adoptium',
        'Java',
        'Microsoft',
        'Amazon Corretto',
        'Zulu',
        'BellSoft',
        'Temurin',
        'AdoptOpenJDK',
      ]) {
        const vendorDir = path.join(root, vendor);
        if (!fs.existsSync(vendorDir)) continue;
        try {
          for (const name of fs.readdirSync(vendorDir)) {
            for (const n of preferredNames) {
              const bin = path.join(vendorDir, name, 'bin', n);
              if (fs.existsSync(bin)) candidates.push(bin);
            }
          }
        } catch {
          /* */
        }
      }
    }
  } else {
    candidates.push('/usr/bin/java', '/usr/lib/jvm/default-java/bin/java');
  }

  const scored = candidates
    .filter((c) => {
      try {
        return !!c && fs.existsSync(c);
      } catch {
        return false;
      }
    })
    .map((c) => {
      let score = 0;
      const lower = c.toLowerCase();
      if (lower.includes('javaw')) score += 5;
      if (lower.includes('21') || lower.includes('22') || lower.includes('23') || lower.includes('24')) score += 20;
      if (lower.includes('java-runtime-delta') || lower.includes('java-runtime-gamma')) score += 15;
      if (lower.includes('adoptium') || lower.includes('temurin')) score += 8;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0]) {
    log.info('Found Java', { path: scored[0].c });
    return scored[0].c;
  }

  try {
    const cmd = isWin ? 'where java' : 'which java';
    const out = execSync(cmd, { encoding: 'utf8', timeout: 3000, windowsHide: true })
      .trim()
      .split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* */
  }
  return null;
}

function probeJavaVersion(javaPath: string): number {
  try {
    const out = execSync(`"${javaPath}" -version 2>&1`, {
      encoding: 'utf8',
      timeout: 6000,
      windowsHide: true,
      shell: true,
    });
    const m = String(out).match(/version "(\d+)/i);
    if (m) return parseInt(m[1], 10);
  } catch (e: any) {
    const msg = `${e?.stdout || ''}${e?.stderr || ''}${e?.message || ''}`;
    const m = msg.match(/version "(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  const lower = javaPath.toLowerCase();
  if (lower.includes('java-runtime-delta')) return 21;
  if (lower.includes('java-runtime-gamma')) return 21;
  if (lower.includes('jdk-24') || lower.includes('jre-24')) return 24;
  if (lower.includes('jdk-23') || lower.includes('jre-23')) return 23;
  if (lower.includes('jdk-22') || lower.includes('jre-22')) return 22;
  if (lower.includes('jdk-21') || lower.includes('jre-21')) return 21;
  return 21;
}

/** Drop JVM flags this Java build does not understand. */
function filterJvmArgs(args: string[], javaMajor: number): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    // Java 23+ only — causes "Could not create the Java Virtual Machine" on Java 21
    if (a.startsWith('--sun-misc-unsafe-memory-access')) {
      if (javaMajor >= 23) out.push(a);
      else log.info('Stripping unsupported JVM flag', { a, javaMajor });
      continue;
    }
    if (a.startsWith('--enable-native-access') && javaMajor < 22) continue;
    if (a.startsWith('--illegal-native-access') && javaMajor < 24) continue;
    out.push(a);
  }
  return out;
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
      if (lower.includes('fabric-loader') || lower.includes('fabric')) s += 100;
      else if (lower.includes('quilt')) s += 40;
      else return 0;
    }
    if (preferredMc && lower.includes(preferredMc.toLowerCase())) s += 80;
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

function resolveVersionJson(mcDir: string, versionId: string, depth = 0): any {
  if (depth > 8) return {};
  const jsonPath = path.join(mcDir, 'versions', versionId, `${versionId}.json`);
  if (!fs.existsSync(jsonPath)) return {};
  let json: any;
  try {
    json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    return {};
  }
  if (json.inheritsFrom) {
    const parent = resolveVersionJson(mcDir, json.inheritsFrom, depth + 1);
    const merged: any = {
      ...parent,
      ...json,
      libraries: [...(parent.libraries || []), ...(json.libraries || [])],
      arguments: {
        jvm: [...(parent.arguments?.jvm || []), ...(json.arguments?.jvm || [])],
        game: [...(parent.arguments?.game || []), ...(json.arguments?.game || [])],
      },
    };
    if (json.mainClass) merged.mainClass = json.mainClass;
    if (json.assetIndex) merged.assetIndex = json.assetIndex;
    if (json.assets) merged.assets = json.assets;
    return merged;
  }
  return json;
}

function libRulesAllow(lib: any): boolean {
  if (!lib.rules || !lib.rules.length) return true;
  let allowed = false;
  for (const rule of lib.rules) {
    const osMatch =
      !rule.os ||
      (rule.os.name === 'windows' && process.platform === 'win32') ||
      (rule.os.name === 'osx' && process.platform === 'darwin') ||
      (rule.os.name === 'linux' && process.platform === 'linux');
    if (osMatch) allowed = rule.action === 'allow';
  }
  return allowed;
}

function collectLibraries(versionJson: any, mcDir: string): string[] {
  const jars: string[] = [];
  const libRoot = path.join(mcDir, 'libraries');
  const seen = new Set<string>();
  for (const lib of versionJson.libraries || []) {
    if (!libRulesAllow(lib)) continue;
    if (lib.natives && !lib.downloads?.artifact) continue;
    const artifact = lib.downloads?.artifact;
    let p: string | null = null;
    if (artifact?.path) {
      p = path.join(libRoot, artifact.path);
    } else if (lib.name) {
      const parts = String(lib.name).split(':');
      if (parts.length >= 3) {
        const [g, a, v, classifier] = parts;
        const file = classifier ? `${a}-${v}-${classifier}.jar` : `${a}-${v}.jar`;
        p = path.join(libRoot, ...g.split('.'), a, v, file);
      }
    }
    if (p && fs.existsSync(p) && !seen.has(p)) {
      seen.add(p);
      jars.push(p);
    }
  }
  return jars;
}

function extractNatives(versionJson: any, mcDir: string, nativesDir: string): void {
  fs.mkdirSync(nativesDir, { recursive: true });
  const libRoot = path.join(mcDir, 'libraries');
  const osKey = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';

  for (const lib of versionJson.libraries || []) {
    if (!libRulesAllow(lib)) continue;
    let nativePath: string | null = null;

    if (lib.natives && lib.natives[osKey]) {
      const classifier = String(lib.natives[osKey]).replace('${arch}', process.arch === 'x64' ? '64' : '32');
      const classifiers = lib.downloads?.classifiers;
      if (classifiers?.[classifier]?.path) {
        nativePath = path.join(libRoot, classifiers[classifier].path);
      }
    } else if (lib.name && String(lib.name).includes(':natives-')) {
      const parts = String(lib.name).split(':');
      if (parts.length >= 4 && parts[3].includes(`natives-${osKey}`)) {
        const [g, a, v, classifier] = parts;
        nativePath = path.join(libRoot, ...g.split('.'), a, v, `${a}-${v}-${classifier}.jar`);
      }
    }

    if (!nativePath || !fs.existsSync(nativePath)) continue;
    try {
      if (process.platform === 'win32') {
        execSync(`tar -xf "${nativePath}" -C "${nativesDir}"`, {
          windowsHide: true, timeout: 15000, stdio: 'ignore',
        });
      } else {
        execSync(`unzip -o -q "${nativePath}" -d "${nativesDir}"`, {
          timeout: 15000, stdio: 'ignore',
        });
      }
    } catch {
      log.warn('Failed to extract natives', { nativePath });
    }
  }
}

function expandArg(arg: string, vars: Record<string, string>): string {
  return arg.replace(/\$\{([^}]+)\}/g, (_, key) => (key in vars ? vars[key] : ''));
}

function rulesAllowArg(rules: any[] | undefined): boolean {
  if (!rules || !rules.length) return true;
  let allowed = false;
  for (const rule of rules) {
    let osOk = true;
    if (rule.os) {
      const name = rule.os.name;
      osOk =
        (name === 'windows' && process.platform === 'win32') ||
        (name === 'osx' && process.platform === 'darwin') ||
        (name === 'linux' && process.platform === 'linux');
    }
    if (osOk) allowed = rule.action === 'allow';
  }
  return allowed;
}

function buildJvmAndGameArgs(
  versionJson: any,
  vars: Record<string, string>,
): { jvm: string[]; game: string[] } {
  const jvm: string[] = [];
  const game: string[] = [];

  for (const entry of versionJson.arguments?.jvm || []) {
    if (typeof entry === 'string') jvm.push(expandArg(entry, vars));
    else if (entry && typeof entry === 'object') {
      if (!rulesAllowArg(entry.rules)) continue;
      const val = entry.value;
      if (Array.isArray(val)) for (const v of val) jvm.push(expandArg(String(v), vars));
      else if (val != null) jvm.push(expandArg(String(val), vars));
    }
  }

  const gameArgs = versionJson.arguments?.game || [];
  if (gameArgs.length) {
    for (const entry of gameArgs) {
      if (typeof entry === 'string') game.push(expandArg(entry, vars));
      else if (entry && typeof entry === 'object') {
        if (!rulesAllowArg(entry.rules)) continue;
        const val = entry.value;
        if (Array.isArray(val)) for (const v of val) game.push(expandArg(String(v), vars));
        else if (val != null) game.push(expandArg(String(val), vars));
      }
    }
  } else if (versionJson.minecraftArguments) {
    for (const tok of String(versionJson.minecraftArguments).split(/\s+/)) {
      if (tok) game.push(expandArg(tok, vars));
    }
  }
  return { jvm, game };
}

function findOfficialLauncher(): string | null {
  if (process.platform !== 'win32') return null;
  const home = process.env.USERPROFILE || '';
  const localApp = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  for (const c of [
    path.join(programFiles, 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    path.join(localApp, 'Programs', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
  ]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function ensureLauncherProfile(mcDir: string, versionId: string, profileName: string): void {
  const profilesPath = path.join(mcDir, 'launcher_profiles.json');
  let data: any = { profiles: {}, settings: {}, version: 3 };
  try {
    if (fs.existsSync(profilesPath)) data = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
  } catch {
    /* */
  }
  if (!data.profiles) data.profiles = {};
  const now = new Date().toISOString();
  data.profiles[profileName] = {
    ...(data.profiles[profileName] || {}),
    name: profileName,
    type: 'custom',
    created: data.profiles[profileName]?.created || now,
    lastUsed: now,
    lastVersionId: versionId,
    icon: 'Furnace',
  };
  data.selectedProfile = profileName;
  try {
    fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    log.warn('Failed to write launcher_profiles.json', { err: String(e) });
  }
}

export async function launchGame(): Promise<{
  ok: boolean;
  message: string;
  pid?: number;
  needsSetup?: boolean;
}> {
  if (isRunning()) return { ok: false, message: 'Minecraft is already running from TT Launcher.' };

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
  if (!installed.ok) return { ok: false, message: installed.message, needsSetup: true };

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
      message: 'Java not found. Install Temurin JDK 21+ or open the official Minecraft Launcher once.',
      needsSetup: true,
    };
  }

  const identity = getLaunchIdentity(account);
  report(55, 'loader', `Finding ${loader} profile for ${mcVersion}…`);
  const found = findLoaderVersion(mcDir, loader, mcVersion);
  if (!found) {
    return {
      ok: false,
      message:
        `No ${loader} install found for Minecraft ${mcVersion}.\nInstall NeoForge/Fabric once, then Launch again.`,
      needsSetup: true,
    };
  }

  const { versionDir, versionId } = found;
  report(60, 'resolve', `Resolving version chain for ${versionId}…`);
  const versionJson = resolveVersionJson(mcDir, versionId);
  const mainClass =
    versionJson.mainClass ||
    (loader === 'fabric'
      ? 'net.fabricmc.loader.impl.launch.knot.KnotClient'
      : 'cpw.mods.bootstraplauncher.BootstrapLauncher');

  report(70, 'libs', `Building classpath (${versionId})…`);
  const jars = collectLibraries(versionJson, mcDir);
  const clientJarCandidates = [
    path.join(versionDir, `${versionId}.jar`),
    versionJson.inheritsFrom
      ? path.join(mcDir, 'versions', versionJson.inheritsFrom, `${versionJson.inheritsFrom}.jar`)
      : '',
    path.join(mcDir, 'versions', mcVersion, `${mcVersion}.jar`),
  ].filter(Boolean);
  for (const cj of clientJarCandidates) {
    if (fs.existsSync(cj) && !jars.includes(cj)) {
      jars.push(cj);
      break;
    }
  }

  if (jars.length < 5) {
    return {
      ok: false,
      message: `Libraries incomplete (${jars.length} jars). Run the ${loader} installer once.`,
      needsSetup: true,
    };
  }

  const nativesDir = path.join(versionDir, 'natives');
  report(75, 'natives', 'Extracting natives…');
  try {
    extractNatives(versionJson, mcDir, nativesDir);
  } catch (e) {
    log.warn('natives extract issue', { err: String(e) });
  }

  const classpath = jars.join(process.platform === 'win32' ? ';' : ':');
  const mem = instance.memoryMb || settings.memoryMb || 4096;
  const assetsDir = path.join(mcDir, 'assets');
  const assetIndex = versionJson.assetIndex?.id || versionJson.assets || mcVersion;

  const vars: Record<string, string> = {
    classpath,
    library_directory: path.join(mcDir, 'libraries'),
    libraries_directory: path.join(mcDir, 'libraries'),
    natives_directory: nativesDir,
    launcher_name: 'TT-Launcher',
    launcher_version: '1.7.4',
    version_name: versionId,
    version_type: 'release',
    game_directory: mcDir,
    assets_root: assetsDir,
    assets_index_name: assetIndex,
    auth_player_name: identity.username,
    auth_uuid: identity.uuid,
    auth_access_token: identity.accessToken || '0',
    auth_session: identity.accessToken || '0',
    user_type: identity.offline ? 'legacy' : 'msa',
    user_properties: '{}',
    clientid: 'tt-launcher',
    auth_xuid: '0',
  };

  report(80, 'args', 'Building JVM + game arguments…');
  const { jvm: jvmFromJson, game: gameFromJson } = buildJvmAndGameArgs(versionJson, vars);

  const jvm: string[] = [`-Xmx${mem}M`, `-Xms${Math.min(1024, mem)}M`, ...jvmFromJson];
  if (!jvm.some((a) => a.includes('java.library.path'))) {
    jvm.push(`-Djava.library.path=${nativesDir}`);
  }

  let game = gameFromJson;
  if (!game.length) {
    game = [
      '--username', identity.username,
      '--uuid', identity.uuid,
      '--accessToken', identity.accessToken || '0',
      '--version', versionId,
      '--gameDir', mcDir,
      '--assetsDir', assetsDir,
      '--assetIndex', assetIndex,
      '--userType', identity.offline ? 'legacy' : 'msa',
      '--versionType', 'TT-Launcher',
    ];
  }

  let cleanJvm = jvm.filter((a) => a != null && String(a).length > 0);
  const cleanGame = game.filter((a) => a != null && String(a).length > 0);

  const javaMajor = probeJavaVersion(java);
  report(82, 'java', `Detected Java ${javaMajor} — filtering JVM flags`);
  cleanJvm = filterJvmArgs(cleanJvm, javaMajor);

  const args = [...cleanJvm, '-cp', classpath, mainClass, ...cleanGame];

  report(88, 'spawn', `Starting ${mainClass} (${jars.length} libs)…`);
  log.info('Direct spawn', { java, mainClass, versionId, loader, libs: jars.length });

  try {
    fs.writeFileSync(
      path.join(mcDir, 'tt-last-launch.txt'),
      [`java=${java}`, `mainClass=${mainClass}`, `version=${versionId}`, `javaMajor=${javaMajor}`, '', ...args].join('\n'),
      'utf8',
    );
  } catch {
    /* */
  }

  let child: ChildProcess;
  try {
    child = spawn(java, args, {
      cwd: mcDir,
      env: { ...process.env },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });
  } catch (e: any) {
    return { ok: false, message: `Could not start Java:\n${e?.message || e}`, needsSetup: true };
  }

  running = child;

  let earlyLog = '';
  const capture = (d: Buffer) => {
    const s = d.toString();
    earlyLog += s;
    if (earlyLog.length > 12000) earlyLog = earlyLog.slice(-12000);
    const line = s.trim().slice(0, 200);
    if (line) report(92, 'game', line);
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  const spawnError = await new Promise<string | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 2000);
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
    return { ok: false, message: `Java failed to start (${spawnError}).`, needsSetup: true };
  }

  const earlyExit = await new Promise<{ code: number | null } | null>((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, 4000);
    child.once('exit', (code) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve({ code });
    });
  });

  const fatalJvm =
    /Could not create the Java Virtual Machine/i.test(earlyLog) ||
    /Unrecognized option:/i.test(earlyLog) ||
    /Error: A fatal exception has occurred/i.test(earlyLog);

  if (earlyExit || fatalJvm) {
    running = null;
    try {
      child.kill();
    } catch {
      /* */
    }
    const snippet = earlyLog.trim().slice(-1500) || '(no output)';
    log.error('Minecraft failed to start', { code: earlyExit?.code, fatalJvm, snippet });

    report(95, 'fallback', 'Direct launch failed — opening official Minecraft Launcher…');
    ensureLauncherProfile(mcDir, versionId, 'TT Client');
    const official = findOfficialLauncher();
    if (official) {
      try {
        spawn(official, [], { detached: true, stdio: 'ignore', cwd: path.dirname(official) }).unref();
        report(100, 'done', 'Opened official Minecraft Launcher with TT profile. Press Play.');
        return {
          ok: true,
          message:
            `Direct launch failed. Opened official Minecraft Launcher.\n` +
            `Select profile "TT Client" (${versionId}) and press Play.\n\nLog:\n${snippet}`,
        };
      } catch {
        /* */
      }
    }

    return {
      ok: false,
      message: `Minecraft failed to start.\n\nLog:\n${snippet}`,
      needsSetup: true,
    };
  }

  child.on('exit', (code) => {
    log.info('Minecraft exited', { code });
    running = null;
  });

  updateInstance(instance.id, { lastPlayed: Date.now() });
  ensureLauncherProfile(mcDir, versionId, 'TT Client');
  report(100, 'done', `Game running (pid ${child.pid}). Window should appear shortly…`);
  return {
    ok: true,
    message: `Launching ${loader} ${versionId}…\nPID ${child.pid}`,
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

export function killAllMinecraftProcesses(): { ok: boolean; message: string; killed: string[] } {
  const killed: string[] = [];
  stopGame();
  killed.push('tt-launcher-child');
  if (process.platform === 'win32') {
    for (const name of ['javaw.exe', 'java.exe', 'Minecraft.exe', 'MinecraftLauncher.exe']) {
      try {
        execSync(`taskkill /F /IM ${name} /T`, {
          encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        });
        killed.push(name);
      } catch {
        /* */
      }
    }
  }
  return {
    ok: true,
    message: `Ended processes: ${killed.join(', ')}`,
    killed,
  };
}
