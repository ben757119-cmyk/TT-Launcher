/**
 * Integrate with the official Minecraft launcher install:
 *  - %AppData%\.minecraft (Windows) or ~/.minecraft
 *  - mods/ + resourcepacks/ folders
 *  - Import the signed-in Microsoft account from launcher_accounts.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getStore, AccountRecord } from './store';
import { BUNDLED } from './config';
import { log } from './logger';

export function getDefaultMinecraftDir(): string {
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, '.minecraft');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft');
  }
  return path.join(os.homedir(), '.minecraft');
}

export function ensureMinecraftLayout(mcDir: string): void {
  for (const sub of ['mods', 'resourcepacks', 'config', 'logs', 'versions', 'libraries', 'assets']) {
    fs.mkdirSync(path.join(mcDir, sub), { recursive: true });
  }
}

function bundledCandidates(fileName: string): string[] {
  return [
    path.join(process.resourcesPath || '', 'bundled', fileName),
    path.join(process.resourcesPath || '', fileName),
    path.join(__dirname, '..', '..', 'resources', 'bundled', fileName),
    path.join(process.cwd(), 'resources', 'bundled', fileName),
    path.join(app.getAppPath(), 'resources', 'bundled', fileName),
  ];
}

function findBundled(fileName: string): string | null {
  for (const c of bundledCandidates(fileName)) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

export function installBundledTtIntoMinecraft(mcDir?: string): { jarPath: string } | null {
  const root = mcDir || getDefaultMinecraftDir();
  ensureMinecraftLayout(root);
  const src = findBundled(BUNDLED.ttJar);
  if (!src) {
    log.warn('No bundled ttclient.jar in launcher package');
    return null;
  }
  const mods = path.join(root, 'mods');
  try {
    for (const name of fs.readdirSync(mods)) {
      if (/^ttclient.*\.jar(\.disabled)?$/i.test(name) || /^tt[-_]?client.*\.jar(\.disabled)?$/i.test(name)) {
        fs.unlinkSync(path.join(mods, name));
      }
    }
  } catch {
    /* ignore */
  }
  const dest = path.join(mods, 'ttclient.jar');
  fs.copyFileSync(src, dest);
  log.info('Installed bundled TT Client into .minecraft/mods', { dest });
  return { jarPath: dest };
}

export function installBundledPackIntoMinecraft(mcDir?: string): { packPath: string } | null {
  const root = mcDir || getDefaultMinecraftDir();
  ensureMinecraftLayout(root);
  const src = findBundled(BUNDLED.ttPack);
  if (!src) {
    log.warn('No bundled TT resource pack in launcher package');
    return null;
  }
  const dest = path.join(root, 'resourcepacks', BUNDLED.ttPack);
  fs.copyFileSync(src, dest);
  log.info('Installed bundled TT resource pack', { dest });
  return { packPath: dest };
}

export function setTtModEnabled(enabled: boolean, mcDir?: string): void {
  const root = mcDir || getDefaultMinecraftDir();
  const mods = path.join(root, 'mods');
  const on = path.join(mods, 'ttclient.jar');
  const off = path.join(mods, 'ttclient.jar.disabled');
  try {
    if (enabled) {
      if (fs.existsSync(off) && !fs.existsSync(on)) fs.renameSync(off, on);
    } else {
      if (fs.existsSync(on) && !fs.existsSync(off)) fs.renameSync(on, off);
    }
  } catch (e: any) {
    log.error('setTtModEnabled failed', { err: String(e?.message || e) });
  }
}

export function importOfficialLauncherAccount(): AccountRecord | null {
  const mc = getDefaultMinecraftDir();
  const candidates = [
    path.join(mc, 'launcher_accounts.json'),
    path.join(mc, 'launcher_accounts_microsoft_store.json'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const accountsObj = raw.accounts || raw;
      const activeId: string | undefined = raw.activeAccountLocalId || raw.activeAccount || undefined;

      let chosen: any = null;
      if (activeId && accountsObj[activeId]) {
        chosen = accountsObj[activeId];
      } else if (accountsObj && typeof accountsObj === 'object') {
        const keys = Object.keys(accountsObj);
        if (keys.length) chosen = accountsObj[keys[0]];
      }
      if (!chosen) continue;

      const profile = chosen.minecraftProfile || chosen.profile || {};
      const name = profile.name || chosen.username || chosen.name;
      const uuid = (profile.id || chosen.uuid || chosen.remoteId || '').replace(/-/g, '');
      const accessToken =
        chosen.accessToken ||
        chosen.access_token ||
        chosen.ygg?.token ||
        chosen.minecraftStore?.token ||
        '';

      if (!name) continue;

      const record: AccountRecord = {
        id: uuidv4(),
        name: String(name),
        uuid: uuid || uuidv4().replace(/-/g, ''),
        type: accessToken ? 'msa' : 'offline',
        tokenBlob: accessToken
          ? JSON.stringify({ accessToken, source: 'official-launcher', localId: activeId })
          : undefined,
        lastUsed: Date.now(),
      };

      const store = getStore();
      const existing = store.get('accounts').filter((a) => a.name !== record.name);
      existing.unshift(record);
      store.set('accounts', existing);
      const s = store.get('settings');
      s.lastSelectedAccountId = record.id;
      store.set('settings', s);

      log.info('Imported official launcher account', { name: record.name, type: record.type, hasToken: !!accessToken });
      return record;
    } catch (e: any) {
      log.warn('Failed reading official launcher accounts', { file, err: String(e?.message || e) });
    }
  }
  return null;
}

export function setupVanillaIntegration(): {
  mcDir: string;
  jar?: string;
  pack?: string;
  account?: AccountRecord;
} {
  const mcDir = getDefaultMinecraftDir();
  ensureMinecraftLayout(mcDir);
  const jar = installBundledTtIntoMinecraft(mcDir)?.jarPath;
  const pack = installBundledPackIntoMinecraft(mcDir)?.packPath;
  let account = getStore().get('accounts')[0];
  if (!account) {
    account = importOfficialLauncherAccount() || undefined;
  }
  return { mcDir, jar, pack, account: account || undefined };
}
