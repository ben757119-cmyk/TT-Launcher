import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { log } from './logger';
import { BUNDLED, TtLoader } from './config';
import {
  getDefaultMinecraftDir,
  ensureMinecraftLayout,
  installBundledPackIntoMinecraft,
} from './vanilla-mc';

export interface TargetBuild {
  loader: string;
  minecraft: string;
  jar: string;
  status: 'supported' | 'experimental' | 'unavailable';
  note?: string;
}

export interface TargetManifest {
  ttClientVersion: string;
  resourcePack: string;
  builds: TargetBuild[];
  unsupported?: Record<string, string>;
}

function bundledRoots(): string[] {
  return [
    path.join(process.resourcesPath || '', 'bundled'),
    path.join(process.resourcesPath || '', ''),
    path.join(__dirname, '..', '..', 'resources', 'bundled'),
    path.join(process.cwd(), 'resources', 'bundled'),
    path.join(app.getAppPath(), 'resources', 'bundled'),
  ];
}

export function loadManifest(): TargetManifest | null {
  for (const root of bundledRoots()) {
    const p = path.join(root, 'manifest.json');
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8')) as TargetManifest;
      } catch {
        /* */
      }
    }
  }
  return null;
}

function resolveBundledFile(relative: string): string | null {
  for (const root of bundledRoots()) {
    const p = path.join(root, relative);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function findTargetBuild(loader: TtLoader, mcVersion: string): TargetBuild | null {
  const man = loadManifest();
  if (!man) {
    if (loader === 'neoforge' && (mcVersion === '26.2' || !mcVersion)) {
      return {
        loader: 'neoforge',
        minecraft: '26.2',
        jar: BUNDLED.ttJar,
        status: 'supported',
      };
    }
    return null;
  }
  return (
    man.builds.find(
      (b) => b.loader === loader && b.minecraft === mcVersion && b.status !== 'unavailable',
    ) || null
  );
}

export function listAvailableTargets(): TargetBuild[] {
  const man = loadManifest();
  return man?.builds?.filter((b) => b.status !== 'unavailable') || [];
}

function disableOtherTtJars(modsDir: string, keepName: string) {
  if (!fs.existsSync(modsDir)) return;
  for (const f of fs.readdirSync(modsDir)) {
    if (!/^ttclient.*\.jar(\.disabled)?$/i.test(f) && !/^tt[-_]?client.*\.jar(\.disabled)?$/i.test(f)) {
      continue;
    }
    const full = path.join(modsDir, f);
    if (f === keepName) {
      if (f.endsWith('.disabled')) {
        const on = f.slice(0, -'.disabled'.length);
        try {
          fs.renameSync(full, path.join(modsDir, on));
        } catch {
          /* */
        }
      }
      continue;
    }
    if (!f.endsWith('.disabled')) {
      try {
        fs.renameSync(full, full + '.disabled');
      } catch {
        /* */
      }
    }
  }
}

export function installTarget(
  loader: TtLoader,
  mcVersion: string,
): {
  ok: boolean;
  message: string;
  jarPath?: string;
  packPath?: string;
  build?: TargetBuild;
} {
  const mcDir = getDefaultMinecraftDir();
  ensureMinecraftLayout(mcDir);
  const modsDir = path.join(mcDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  const build = findTargetBuild(loader, mcVersion);
  if (!build) {
    const man = loadManifest();
    let hint = '';
    if (loader === 'fabric') {
      hint = man?.unsupported?.fabric || 'Fabric TT Client is not published yet.';
    } else if (mcVersion.startsWith('1.21')) {
      hint =
        man?.unsupported?.['1.21.x'] ||
        'TT Client is built for Minecraft 26.2 / NeoForge. 1.21.x needs a separate rebuild.';
    } else {
      hint = `No TT Client build for ${loader} + Minecraft ${mcVersion}.`;
    }
    return {
      ok: false,
      message:
        `${hint}\n\nAvailable builds:\n` +
        listAvailableTargets()
          .map((b) => `  • ${b.loader} ${b.minecraft} (${b.status})`)
          .join('\n'),
    };
  }

  const src = resolveBundledFile(build.jar) || resolveBundledFile(BUNDLED.ttJar);
  if (!src || !fs.existsSync(src)) {
    return {
      ok: false,
      message: `Bundled jar missing for ${loader} ${mcVersion} (${build.jar}).`,
    };
  }

  const destName = `ttclient-${loader}-${mcVersion}.jar`;
  const dest = path.join(modsDir, destName);
  fs.copyFileSync(src, dest);
  disableOtherTtJars(modsDir, destName);

  try {
    fs.copyFileSync(src, path.join(modsDir, 'ttclient.jar'));
  } catch {
    /* */
  }

  const pack = installBundledPackIntoMinecraft(mcDir);

  log.info('Installed target TT Client', {
    loader,
    mcVersion,
    dest,
    status: build.status,
    pack: pack?.packPath,
  });

  let message = `Installed TT Client for ${loader} ${mcVersion} → ${destName}`;
  if (build.status === 'experimental') {
    message += `\n(Experimental: ${build.note || 'may need matching loader profile'})`;
  }
  if (pack?.packPath) {
    message += `\nResource pack → ${path.basename(pack.packPath)}`;
  }

  return {
    ok: true,
    message,
    jarPath: dest,
    packPath: pack?.packPath,
    build,
  };
}
