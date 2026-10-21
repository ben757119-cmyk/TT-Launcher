import Store from 'electron-store';
import path from 'path';
import { app } from 'electron';
import { DEFAULT_MEMORY_MB, DEFAULT_WIDTH, DEFAULT_HEIGHT, TT_GITHUB } from './config';

export interface AccountRecord {
  id: string;
  name: string;
  uuid: string;
  type: 'msa' | 'offline';
  avatarUrl?: string;
  /** Opaque token payload managed by auth module — never log. */
  tokenBlob?: string;
  expiresAt?: number;
  lastUsed?: number;
}

export interface InstanceRecord {
  id: string;
  name: string;
  minecraftVersion: string;
  neoforgeVersion: string;
  gameDir: string;
  memoryMb: number;
  javaPath?: string;
  jvmArgs: string;
  ttClientVersion?: string;
  ttClientJar?: string;
  createdAt: number;
  lastPlayed?: number;
}

export interface LauncherSettings {
  defaultInstanceId?: string;
  javaPath?: string;
  memoryMb: number;
  resolution: { width: number; height: number; fullscreen: boolean };
  jvmArgs: string;
  gameDirectoryRoot: string;
  autoInstallTtPack: boolean;
  autoEnableTtPack: boolean;
  keepTtPackUpdated: boolean;
  accentPurple: string;
  accentTeal: string;
  particles: boolean;
  reducedMotion: boolean;
  uiScale: number;
  downloadConcurrency: number;
  networkTimeoutMs: number;
  githubOwner: string;
  githubRepo: string;
  msClientId: string;
  lastSelectedAccountId?: string;
}

export interface PackInstallRecord {
  id: string;
  slug: string;
  name: string;
  versionId?: string;
  versionNumber?: string;
  fileName: string;
  path: string;
  enabled: boolean;
  iconUrl?: string;
  installedAt: number;
  source: 'modrinth' | 'file' | 'tt-official';
}

interface Schema {
  accounts: AccountRecord[];
  instances: InstanceRecord[];
  settings: LauncherSettings;
  packs: PackInstallRecord[];
  packPriority: string[];
}

function defaultGameRoot(): string {
  // Prefer standard .minecraft adjacent folder for TT instances
  const home = app.getPath('home');
  return path.join(home, '.tt-launcher', 'instances');
}

const defaults: Schema = {
  accounts: [],
  instances: [],
  packs: [],
  packPriority: [],
  settings: {
    memoryMb: DEFAULT_MEMORY_MB,
    resolution: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, fullscreen: false },
    jvmArgs: '',
    gameDirectoryRoot: '',
    autoInstallTtPack: true,
    autoEnableTtPack: true,
    keepTtPackUpdated: true,
    accentPurple: '#9b5cff',
    accentTeal: '#00e8a0',
    particles: true,
    reducedMotion: false,
    uiScale: 1,
    downloadConcurrency: 4,
    networkTimeoutMs: 30000,
    githubOwner: TT_GITHUB.owner,
    githubRepo: TT_GITHUB.repo,
    msClientId: '',
  },
};

let store: Store<Schema> | null = null;

export function getStore(): Store<Schema> {
  if (!store) {
    store = new Store<Schema>({
      name: 'tt-launcher',
      defaults,
      clearInvalidConfig: true,
    });
    const s = store.get('settings');
    if (!s.gameDirectoryRoot) {
      s.gameDirectoryRoot = defaultGameRoot();
      store.set('settings', s);
    }
  }
  return store;
}
