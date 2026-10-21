import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import { LAUNCHER_VERSION, TT_COMPAT, TT_WEBSITE } from './config';
import { getStore } from './store';
import { log } from './logger';
import * as auth from './auth';
import * as instances from './instances';
import * as ttInstall from './tt-install';
import * as packs from './packs';
import * as modrinth from './modrinth';
import * as launch from './launch';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0b0f',
    title: 'TT Launcher — The Third',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function send(channel: string, payload: unknown) {
  mainWindow?.webContents.send(channel, payload);
}

app.whenReady().then(() => {
  log.info('TT Launcher starting', { version: LAUNCHER_VERSION });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC ──────────────────────────────────────────────

ipcMain.handle('app:getMeta', async () => ({
  launcherVersion: LAUNCHER_VERSION,
  ttCompat: TT_COMPAT,
  website: TT_WEBSITE,
  logPath: log.path(),
  platform: process.platform,
}));

ipcMain.handle('settings:get', async () => getStore().get('settings'));
ipcMain.handle('settings:set', async (_e, patch: Record<string, unknown>) => {
  const store = getStore();
  const cur = store.get('settings');
  store.set('settings', { ...cur, ...patch });
  return store.get('settings');
});

ipcMain.handle('accounts:list', async () => auth.listAccounts());
ipcMain.handle('accounts:active', async () => auth.getActiveAccount());
ipcMain.handle('accounts:select', async (_e, id: string) => auth.selectAccount(id));
ipcMain.handle('accounts:remove', async (_e, id: string) => {
  auth.removeAccount(id);
  return true;
});
ipcMain.handle('accounts:signInMs', async () => {
  return auth.signInMicrosoft((p) => send('accounts:authProgress', p));
});
ipcMain.handle('accounts:signInOffline', async (_e, name: string) => auth.signInOffline(name));
ipcMain.handle('accounts:clientIdConfigured', async () => !!auth.getMsClientId());

ipcMain.handle('instances:list', async () => instances.listInstances());
ipcMain.handle('instances:getDefault', async () => instances.getDefaultInstance());
ipcMain.handle('instances:create', async (_e, opts) => instances.createInstance(opts));
ipcMain.handle('instances:update', async (_e, id, patch) => instances.updateInstance(id, patch));
ipcMain.handle('instances:delete', async (_e, id, deleteFiles) => {
  instances.deleteInstance(id, !!deleteFiles);
  return true;
});
ipcMain.handle('instances:setDefault', async (_e, id) => {
  instances.setDefaultInstance(id);
  return true;
});
ipcMain.handle('instances:duplicate', async (_e, id, name) => instances.duplicateInstance(id, name));
ipcMain.handle('instances:openFolder', async (_e, id) => {
  const inst = instances.getInstance(id);
  if (inst) shell.openPath(inst.gameDir);
});

ipcMain.handle('tt:fetchReleases', async () => ttInstall.fetchTtReleases());
ipcMain.handle('tt:install', async (_e, tag?: string) => {
  return ttInstall.installTtClient((s) => send('tt:installProgress', s), tag);
});
ipcMain.handle('tt:installFromFile', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Select TT Client JAR',
    filters: [{ name: 'JAR', extensions: ['jar'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return ttInstall.installTtClientFromFile(res.filePaths[0]);
});

ipcMain.handle('packs:list', async () => packs.listInstalledPacks());
ipcMain.handle('packs:scan', async (_e, instanceId?: string) => packs.scanInstancePacks(instanceId));
ipcMain.handle('packs:installModrinth', async (_e, opts) => {
  return packs.installPackFromModrinth({
    ...opts,
    onProgress: (pct, msg) => send('packs:progress', { pct, msg }),
  });
});
ipcMain.handle('packs:installFile', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Import resource pack ZIP',
    filters: [{ name: 'Resource Pack', extensions: ['zip'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return packs.installPackFromFile(res.filePaths[0]);
});
ipcMain.handle('packs:uninstall', async (_e, id) => {
  packs.uninstallPack(id);
  return true;
});
ipcMain.handle('packs:setEnabled', async (_e, id, enabled) => {
  packs.setPackEnabled(id, enabled);
  return true;
});

ipcMain.handle('modrinth:search', async (_e, opts) => modrinth.searchProjects(opts));
ipcMain.handle('modrinth:project', async (_e, id) => modrinth.getProject(id));
ipcMain.handle('modrinth:versions', async (_e, id, opts) => modrinth.getVersions(id, opts));

ipcMain.handle('launch:play', async () => launch.launchGame());
ipcMain.handle('launch:stop', async () => {
  launch.stopGame();
  return true;
});
ipcMain.handle('launch:status', async () => ({
  running: launch.isRunning(),
  pid: launch.getRunningPid(),
}));

ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
});
ipcMain.handle('shell:openLog', async () => {
  shell.openPath(log.path());
});
