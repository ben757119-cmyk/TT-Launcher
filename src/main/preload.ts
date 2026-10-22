import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getMeta: () => ipcRenderer.invoke('app:getMeta'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),

  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  activeAccount: () => ipcRenderer.invoke('accounts:active'),
  selectAccount: (id: string) => ipcRenderer.invoke('accounts:select', id),
  removeAccount: (id: string) => ipcRenderer.invoke('accounts:remove', id),
  signInMs: () => ipcRenderer.invoke('accounts:signInMs'),
  signInOffline: (name: string) => ipcRenderer.invoke('accounts:signInOffline', name),
  clientIdConfigured: () => ipcRenderer.invoke('accounts:clientIdConfigured'),
  onAuthProgress: (cb: (p: unknown) => void) => {
    const handler = (_: unknown, p: unknown) => cb(p);
    ipcRenderer.on('accounts:authProgress', handler);
    return () => ipcRenderer.removeListener('accounts:authProgress', handler);
  },

  listInstances: () => ipcRenderer.invoke('instances:list'),
  getDefaultInstance: () => ipcRenderer.invoke('instances:getDefault'),
  createInstance: (opts: unknown) => ipcRenderer.invoke('instances:create', opts),
  updateInstance: (id: string, patch: unknown) => ipcRenderer.invoke('instances:update', id, patch),
  deleteInstance: (id: string, deleteFiles: boolean) =>
    ipcRenderer.invoke('instances:delete', id, deleteFiles),
  setDefaultInstance: (id: string) => ipcRenderer.invoke('instances:setDefault', id),
  duplicateInstance: (id: string, name: string) =>
    ipcRenderer.invoke('instances:duplicate', id, name),
  openInstanceFolder: (id: string) => ipcRenderer.invoke('instances:openFolder', id),

  fetchTtReleases: () => ipcRenderer.invoke('tt:fetchReleases'),
  installTt: (tag?: string) => ipcRenderer.invoke('tt:install', tag),
  installTtFromFile: () => ipcRenderer.invoke('tt:installFromFile'),
  installTtBundled: () => ipcRenderer.invoke('tt:installBundled'),
  setTtEnabled: (enabled: boolean) => ipcRenderer.invoke('tt:setEnabled', enabled),
  onTtInstallProgress: (cb: (p: unknown) => void) => {
    const handler = (_: unknown, p: unknown) => cb(p);
    ipcRenderer.on('tt:installProgress', handler);
    return () => ipcRenderer.removeListener('tt:installProgress', handler);
  },

  listPacks: () => ipcRenderer.invoke('packs:list'),
  scanPacks: (instanceId?: string) => ipcRenderer.invoke('packs:scan', instanceId),
  installPackModrinth: (opts: unknown) => ipcRenderer.invoke('packs:installModrinth', opts),
  installPackFile: () => ipcRenderer.invoke('packs:installFile'),
  uninstallPack: (id: string) => ipcRenderer.invoke('packs:uninstall', id),
  setPackEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('packs:setEnabled', id, enabled),
  onPackProgress: (cb: (p: unknown) => void) => {
    const handler = (_: unknown, p: unknown) => cb(p);
    ipcRenderer.on('packs:progress', handler);
    return () => ipcRenderer.removeListener('packs:progress', handler);
  },

  modrinthSearch: (opts: unknown) => ipcRenderer.invoke('modrinth:search', opts),
  modrinthProject: (id: string) => ipcRenderer.invoke('modrinth:project', id),
  modrinthVersions: (id: string, opts?: unknown) =>
    ipcRenderer.invoke('modrinth:versions', id, opts),

  vanillaSetup: () => ipcRenderer.invoke('vanilla:setup'),
  importOfficialAccount: () => ipcRenderer.invoke('vanilla:importAccount'),
  getMinecraftDir: () => ipcRenderer.invoke('vanilla:mcDir'),

  play: () => ipcRenderer.invoke('launch:play'),
  stop: () => ipcRenderer.invoke('launch:stop'),
  launchStatus: () => ipcRenderer.invoke('launch:status'),

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openLog: () => ipcRenderer.invoke('shell:openLog'),
};

contextBridge.exposeInMainWorld('tt', api);

export type TtApi = typeof api;
