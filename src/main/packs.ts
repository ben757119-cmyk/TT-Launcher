import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getStore, PackInstallRecord } from './store';
import { getDefaultInstance, getInstance } from './instances';
import { downloadFile } from './download';
import { getVersions, primaryFile, pickCompatibleVersion, getProject } from './modrinth';
import { log } from './logger';

function packsDir(instanceId?: string): string {
  const inst = instanceId ? getInstance(instanceId) : getDefaultInstance();
  if (!inst) throw new Error('No instance selected');
  const dir = path.join(inst.gameDir, 'resourcepacks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listInstalledPacks(): PackInstallRecord[] {
  return getStore().get('packs');
}

export async function installPackFromModrinth(opts: {
  projectId: string;
  versionId?: string;
  gameVersion: string;
  instanceId?: string;
  onProgress?: (pct: number, msg: string) => void;
}): Promise<PackInstallRecord> {
  const project = await getProject(opts.projectId);
  const versions = await getVersions(opts.projectId, {
    gameVersions: [opts.gameVersion],
  });
  let version = opts.versionId
    ? versions.find((v) => v.id === opts.versionId)
    : pickCompatibleVersion(versions, opts.gameVersion, null);
  if (!version) {
    // Fallback: any version for game
    version = versions.find((v) => (v.game_versions || []).includes(opts.gameVersion)) || versions[0];
  }
  if (!version) throw new Error('No compatible resource pack version found');

  const file = primaryFile(version);
  if (!file) throw new Error('Version has no downloadable file');

  const dir = packsDir(opts.instanceId);
  const dest = path.join(dir, file.filename);

  opts.onProgress?.(10, `Downloading ${file.filename}…`);
  await downloadFile(file.url, dest, (p) => {
    opts.onProgress?.(p.percent ?? 50, `Downloading ${file.filename}…`);
  });

  const record: PackInstallRecord = {
    id: uuidv4(),
    slug: project.slug,
    name: project.title || project.slug,
    versionId: version.id,
    versionNumber: version.version_number,
    fileName: file.filename,
    path: dest,
    enabled: true,
    iconUrl: project.icon_url || undefined,
    installedAt: Date.now(),
    source: 'modrinth',
  };

  const store = getStore();
  const packs = store.get('packs').filter((p) => p.slug !== record.slug);
  packs.push(record);
  store.set('packs', packs);

  // Enable in options.txt if present
  setPackEnabledInOptions(opts.instanceId, file.filename, true);

  opts.onProgress?.(100, 'Installed');
  log.info('Installed resource pack', { slug: record.slug, dest });
  return record;
}

export function installPackFromFile(filePath: string, instanceId?: string): PackInstallRecord {
  if (!filePath.toLowerCase().endsWith('.zip')) {
    throw new Error('Resource packs must be .zip files');
  }
  if (!fs.existsSync(filePath)) throw new Error('File not found');

  // Basic validation: zip should exist; deeper structure check optional
  const dir = packsDir(instanceId);
  const base = path.basename(filePath);
  const dest = path.join(dir, base);
  fs.copyFileSync(filePath, dest);

  const record: PackInstallRecord = {
    id: uuidv4(),
    slug: base.replace(/\.zip$/i, ''),
    name: base.replace(/\.zip$/i, ''),
    fileName: base,
    path: dest,
    enabled: true,
    installedAt: Date.now(),
    source: 'file',
  };

  const store = getStore();
  store.set('packs', [...store.get('packs'), record]);
  setPackEnabledInOptions(instanceId, base, true);
  return record;
}

export function uninstallPack(id: string): void {
  const store = getStore();
  const pack = store.get('packs').find((p) => p.id === id);
  if (!pack) return;
  try {
    if (fs.existsSync(pack.path)) fs.unlinkSync(pack.path);
  } catch (e) {
    log.warn('Could not delete pack file', { err: String(e) });
  }
  setPackEnabledInOptions(undefined, pack.fileName, false);
  store.set(
    'packs',
    store.get('packs').filter((p) => p.id !== id),
  );
}

export function setPackEnabled(id: string, enabled: boolean): void {
  const store = getStore();
  const packs = store.get('packs');
  const idx = packs.findIndex((p) => p.id === id);
  if (idx < 0) return;
  packs[idx].enabled = enabled;
  store.set('packs', packs);
  setPackEnabledInOptions(undefined, packs[idx].fileName, enabled);
}

/**
 * Minecraft stores selected resource packs in options.txt as resourcePacks:["file/Name.zip",...]
 * We merge carefully without wiping unrelated keys.
 */
function setPackEnabledInOptions(instanceId: string | undefined, fileName: string, enabled: boolean) {
  try {
    const inst = instanceId ? getInstance(instanceId) : getDefaultInstance();
    if (!inst) return;
    const optionsPath = path.join(inst.gameDir, 'options.txt');
    let content = '';
    if (fs.existsSync(optionsPath)) {
      content = fs.readFileSync(optionsPath, 'utf8');
    }
    const key = 'resourcePacks:';
    const entry = `"file/${fileName}"`;
    let packsLine = content.split(/\r?\n/).find((l) => l.startsWith(key));
    let list: string[] = [];
    if (packsLine) {
      const raw = packsLine.slice(key.length).trim();
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    }
    list = list.filter((x) => x !== entry && x !== fileName);
    if (enabled) {
      // Higher priority near end of list in modern MC — append
      list.push(entry);
    }
    const newLine = key + JSON.stringify(list);
    if (packsLine) {
      content = content
        .split(/\r?\n/)
        .map((l) => (l.startsWith(key) ? newLine : l))
        .join('\n');
    } else {
      content = content.trimEnd() + (content ? '\n' : '') + newLine + '\n';
    }
    fs.writeFileSync(optionsPath, content, 'utf8');
  } catch (e) {
    log.warn('options.txt pack update failed', { err: String(e) });
  }
}

export function scanInstancePacks(instanceId?: string): string[] {
  try {
    const dir = packsDir(instanceId);
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.zip'));
  } catch {
    return [];
  }
}
