import fs from 'fs';
import path from 'path';
import { TT_GITHUB, TT_COMPAT } from './config';
import { getStore, InstanceRecord } from './store';
import { ensureTtInstance, updateInstance } from './instances';
import { downloadFile, parseGithubAssetUrl } from './download';
import { log } from './logger';

export interface InstallStage {
  stage: string;
  message: string;
  percent?: number;
}

export async function fetchTtReleases(): Promise<
  {
    tag: string;
    name: string;
    body: string;
    publishedAt: string;
    assets: { name: string; url: string; size: number }[];
  }[]
> {
  const store = getStore();
  const owner = store.get('settings').githubOwner || TT_GITHUB.owner;
  const repo = store.get('settings').githubRepo || TT_GITHUB.repo;
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=15`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'TT-Launcher/1.0',
    },
  });
  if (res.status === 404) {
    throw new Error(
      `GitHub repository ${owner}/${repo} not found or private. ` +
        `Publish a release with a JAR asset, or set a public mirror in Settings → TT Client.`,
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub releases API ${res.status}`);
  }
  const data = (await res.json()) as any[];
  return data.map((r) => ({
    tag: r.tag_name,
    name: r.name || r.tag_name,
    body: r.body || '',
    publishedAt: r.published_at,
    assets: parseGithubAssetUrl(r.assets || []),
  }));
}

function pickJar(assets: { name: string; url: string; size: number }[]) {
  for (const pattern of TT_GITHUB.jarPatterns) {
    const hit = assets.find((a) => pattern.test(a.name));
    if (hit) return hit;
  }
  return null;
}

/**
 * One-click TT Client install into the default TT instance.
 * Idempotent: skips download if same version JAR already present.
 */
export async function installTtClient(
  onProgress: (s: InstallStage) => void,
  tag?: string,
): Promise<{ instance: InstanceRecord; version: string; jarPath: string }> {
  onProgress({ stage: 'instance', message: 'Preparing TT instance…', percent: 5 });
  const instance = ensureTtInstance();

  onProgress({ stage: 'releases', message: 'Fetching TT Client releases…', percent: 15 });
  let releases: Awaited<ReturnType<typeof fetchTtReleases>>;
  try {
    releases = await fetchTtReleases();
  } catch (e: any) {
    // Fallback: allow manual JAR drop path messaging
    throw e;
  }

  if (!releases.length) {
    throw new Error('No releases published on the configured GitHub repository.');
  }

  const release = tag ? releases.find((r) => r.tag === tag) || releases[0] : releases[0];
  const asset = pickJar(release.assets);
  if (!asset) {
    throw new Error(
      `Release ${release.tag} has no JAR asset. Upload a TT Client JAR to the GitHub release.`,
    );
  }

  const modsDir = path.join(instance.gameDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const destJar = path.join(modsDir, asset.name);

  if (fs.existsSync(destJar) && instance.ttClientVersion === release.tag) {
    onProgress({ stage: 'done', message: 'TT Client already installed.', percent: 100 });
    return { instance, version: release.tag, jarPath: destJar };
  }

  // Remove older TT jars in mods folder (name heuristics)
  for (const f of fs.readdirSync(modsDir)) {
    if (/\.jar$/i.test(f) && /tt|client/i.test(f) && path.join(modsDir, f) !== destJar) {
      try {
        fs.unlinkSync(path.join(modsDir, f));
      } catch {
        /* */
      }
    }
  }

  onProgress({
    stage: 'download',
    message: `Downloading ${asset.name} (${release.tag})…`,
    percent: 25,
  });

  await downloadFile(asset.url, destJar, (p) => {
    const pct = p.percent != null ? 25 + Math.round((p.percent * 0.6) / 1) : 40;
    onProgress({
      stage: 'download',
      message: `Downloading ${asset.name}… ${p.percent ?? '?'}%`,
      percent: Math.min(90, pct),
    });
  });

  // Compatibility note — NeoForge 26.2 expected; we record metadata only
  if (instance.minecraftVersion !== TT_COMPAT.minecraft) {
    log.warn('Instance Minecraft version differs from TT_COMPAT', {
      instance: instance.minecraftVersion,
      expected: TT_COMPAT.minecraft,
    });
  }

  const updated =
    updateInstance(instance.id, {
      ttClientJar: destJar,
      ttClientVersion: release.tag,
    }) || instance;

  onProgress({ stage: 'done', message: `Installed TT Client ${release.tag}`, percent: 100 });
  log.info('Installed TT Client', { tag: release.tag, destJar });
  return { instance: updated, version: release.tag, jarPath: destJar };
}

/**
 * Install a local JAR the user selected (when GitHub is private).
 */
export function installTtClientFromFile(
  jarPath: string,
  versionLabel = 'local',
): InstanceRecord {
  if (!fs.existsSync(jarPath) || !jarPath.toLowerCase().endsWith('.jar')) {
    throw new Error('Select a valid .jar file');
  }
  const instance = ensureTtInstance();
  const modsDir = path.join(instance.gameDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const dest = path.join(modsDir, path.basename(jarPath));
  fs.copyFileSync(jarPath, dest);
  return (
    updateInstance(instance.id, {
      ttClientJar: dest,
      ttClientVersion: versionLabel,
    }) || instance
  );
}
