import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getStore, InstanceRecord } from './store';
import { TT_COMPAT, DEFAULT_MEMORY_MB } from './config';
import { log } from './logger';

export function listInstances(): InstanceRecord[] {
  return getStore().get('instances');
}

export function getInstance(id: string): InstanceRecord | undefined {
  return getStore().get('instances').find((i) => i.id === id);
}

export function getDefaultInstance(): InstanceRecord | null {
  const store = getStore();
  const id = store.get('settings').defaultInstanceId;
  const list = store.get('instances');
  if (id) {
    const found = list.find((i) => i.id === id);
    if (found) return found;
  }
  return list[0] || null;
}

export function createInstance(opts: {
  name: string;
  minecraftVersion?: string;
  neoforgeVersion?: string;
  memoryMb?: number;
}): InstanceRecord {
  const store = getStore();
  const root = store.get('settings').gameDirectoryRoot;
  const id = uuidv4();
  const slug = opts.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'instance';
  const gameDir = path.join(root, `${slug}-${id.slice(0, 8)}`);
  fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'resourcepacks'), { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'logs'), { recursive: true });

  const record: InstanceRecord = {
    id,
    name: opts.name,
    minecraftVersion: opts.minecraftVersion || TT_COMPAT.minecraft,
    neoforgeVersion: opts.neoforgeVersion || TT_COMPAT.neoforge,
    gameDir,
    memoryMb: opts.memoryMb || store.get('settings').memoryMb || DEFAULT_MEMORY_MB,
    jvmArgs: store.get('settings').jvmArgs || '',
    createdAt: Date.now(),
  };

  const instances = store.get('instances');
  instances.push(record);
  store.set('instances', instances);

  if (!store.get('settings').defaultInstanceId) {
    const s = store.get('settings');
    s.defaultInstanceId = id;
    store.set('settings', s);
  }

  log.info('Created instance', { id, name: record.name, gameDir });
  return record;
}

export function updateInstance(id: string, patch: Partial<InstanceRecord>): InstanceRecord | null {
  const store = getStore();
  const instances = store.get('instances');
  const idx = instances.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  instances[idx] = { ...instances[idx], ...patch, id };
  store.set('instances', instances);
  return instances[idx];
}

export function setDefaultInstance(id: string): void {
  const store = getStore();
  if (!store.get('instances').some((i) => i.id === id)) return;
  const s = store.get('settings');
  s.defaultInstanceId = id;
  store.set('settings', s);
}

export function deleteInstance(id: string, deleteFiles: boolean): void {
  const store = getStore();
  const inst = store.get('instances').find((i) => i.id === id);
  store.set(
    'instances',
    store.get('instances').filter((i) => i.id !== id),
  );
  const s = store.get('settings');
  if (s.defaultInstanceId === id) {
    s.defaultInstanceId = store.get('instances')[0]?.id;
    store.set('settings', s);
  }
  if (deleteFiles && inst?.gameDir) {
    try {
      fs.rmSync(inst.gameDir, { recursive: true, force: true });
    } catch (e) {
      log.warn('Failed to delete instance files', { err: String(e) });
    }
  }
}

export function duplicateInstance(id: string, newName: string): InstanceRecord | null {
  const src = getInstance(id);
  if (!src) return null;
  const copy = createInstance({
    name: newName,
    minecraftVersion: src.minecraftVersion,
    neoforgeVersion: src.neoforgeVersion,
    memoryMb: src.memoryMb,
  });
  // Copy mods + resourcepacks
  for (const sub of ['mods', 'resourcepacks', 'config']) {
    const from = path.join(src.gameDir, sub);
    const to = path.join(copy.gameDir, sub);
    if (fs.existsSync(from)) {
      copyDir(from, to);
    }
  }
  if (src.ttClientJar && fs.existsSync(src.ttClientJar)) {
    const destJar = path.join(copy.gameDir, 'mods', path.basename(src.ttClientJar));
    fs.copyFileSync(src.ttClientJar, destJar);
    updateInstance(copy.id, {
      ttClientJar: destJar,
      ttClientVersion: src.ttClientVersion,
    });
  }
  return getInstance(copy.id) || copy;
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function ensureTtInstance(): InstanceRecord {
  const existing = listInstances().find(
    (i) => i.name === 'TT Client' || i.ttClientJar,
  );
  if (existing) return existing;
  return createInstance({
    name: 'TT Client',
    minecraftVersion: TT_COMPAT.minecraft,
    neoforgeVersion: TT_COMPAT.neoforge,
  });
}
