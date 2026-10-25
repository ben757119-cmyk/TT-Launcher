/**
 * Install TT Client jar for exact version match only.
 * Other versions get a clean instance (loader-only) — same layout, no wrong jar.
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { log } from './logger';
import { BUNDLED, TtLoader, SUPPORTED_MC_VERSIONS } from './config';
import {
  getDefaultMinecraftDir,
  ensureMinecraftLayout,
  installBundledPackIntoMinecraft,
} from './vanilla-mc';

export interface TargetBuild {
  loader: string;
  minecraft: string;
  jar: string;
  status: 'supported' | 'experimental' | 'best-effort' | 'unavailable';
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
  if (man) {
    const hit = man.builds.find(
      (b) => b.loader === loader && b.minecraft === mcVersion && b.status !== 'unavailable',
    );
    if (hit) return hit;
  }
  const rel = `variants/${loader}/${mcVersion}/ttclient.jar`;
  if (resolveBundledFile(rel)) {
    return {
      loader,
      minecraft: mcVersion,
      jar: rel,
      status: loader === 'neoforge' && mcVersion === '26.2' ? 'supported' : 'best-effort',
    };
  }
  if (loader === 'neoforge' && mcVersion === '26.2' && resolveBundledFile(BUNDLED.ttJar)) {
    return { loader: 'neoforge', minecraft: '26.2', jar: BUNDLED.ttJar, status: 'supported' };
  }
  return null;
}

export function listAvailableTargets(): TargetBuild[] {
  const man = loadManifest();
  if (man?.builds?.length) return man.builds.filter((b) => b.status !== 'unavailable');
  const out: TargetBuild[] = [];
  for (const loader of ['neoforge', 'fabric'] as TtLoader[]) {
    for (const mc of SUPPORTED_MC_VERSIONS) {
      const b = findTargetBuild(loader, mc);
      if (b) out.push(b);
    }
  }
  return out;
}

function disableOtherTtJars(modsDir: string, keepName: string) {
  if (!fs.existsSync(modsDir)) return;
  for (const f of fs.readdirSync(modsDir)) {
    if (!/^ttclient.*\.jar(\.disabled)?$/i.test(f)) continue;
    const full = path.join(modsDir, f);
    if (keepName && f === keepName) {
      if (f.endsWith('.disabled')) {
        try {
          fs.renameSync(full, path.join(modsDir, f.slice(0, -'.disabled'.length)));
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

export function getTtInstanceDir(loader: TtLoader, mcVersion: string): string {
  return path.join(getDefaultMinecraftDir(), 'tt-instances', `${loader}-${mcVersion}`);
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
  instanceDir?: string;
} {
  const mcDir = getDefaultMinecraftDir();
  ensureMinecraftLayout(mcDir);

  const instanceDir = getTtInstanceDir(loader, mcVersion);
  const modsDir = path.join(instanceDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  fs.mkdirSync(path.join(instanceDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(instanceDir, 'resourcepacks'), { recursive: true });

  const pack = installBundledPackIntoMinecraft(mcDir);
  const build = findTargetBuild(loader, mcVersion);

  if (!build || build.minecraft !== mcVersion) {
    disableOtherTtJars(modsDir, '');
    const msg =
      `Instance ready for ${loader} ${mcVersion} (loader only — no TT Client jar for this version).\n` +
      `→ tt-instances/${loader}-${mcVersion}/\n` +
      `Full TT Client is NeoForge 26.2. Other versions use the same layout so it feels the same.`;
    log.info('installTarget loader-only', { loader, mcVersion, instanceDir });
    return { ok: true, message: msg, instanceDir, packPath: pack?.packPath };
  }

  const src = resolveBundledFile(build.jar);
  if (!src || !fs.existsSync(src)) {
    return {
      ok: true,
      message: `Instance ready; jar file missing (${build.jar}). Launching loader only.`,
      instanceDir,
      packPath: pack?.packPath,
    };
  }

  const destName = `ttclient-${loader}-${mcVersion}.jar`;
  const dest = path.join(modsDir, destName);
  fs.copyFileSync(src, dest);
  disableOtherTtJars(modsDir, destName);

  let message =
    `Installed TT Client (${build.status}) for ${loader} ${mcVersion}\n` +
    `→ tt-instances/${loader}-${mcVersion}/mods/${destName}`;
  if (pack?.packPath) message += `\nResource pack → ${path.basename(pack.packPath)}`;

  log.info('installTarget', { loader, mcVersion, dest, instanceDir, status: build.status });
  return { ok: true, message, jarPath: dest, packPath: pack?.packPath, build, instanceDir };
}
