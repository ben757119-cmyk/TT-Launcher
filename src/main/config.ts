export const LAUNCHER_VERSION = '1.7.0';

export const TT_OWNER = {
  name: 'The_Algorithm67',
  email: 'ben757119@gmail.com',
  discord: '@pyforge_',
  github: 'ben757119-cmyk',
};

export const TT_GITHUB = {
  owner: 'ben757119-cmyk',
  repo: 'TT-Client',
  jarPatterns: [/^ttclient[-_].*\.jar$/i, /^TT[-_]?Client.*\.jar$/i, /.*\.jar$/i],
};

export type TtLoader = 'neoforge' | 'fabric';

export const SUPPORTED_LOADERS: { id: TtLoader; label: string }[] = [
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'fabric', label: 'Fabric' },
];

export const SUPPORTED_MC_VERSIONS: string[] = [
  '26.2',
  '26.1',
  '26.0',
  '1.21.11',
  '1.21.10',
  '1.21.9',
  '1.21.8',
  '1.21.7',
  '1.21.6',
  '1.21.5',
  '1.21.4',
  '1.21.3',
  '1.21.2',
  '1.21.1',
];

export const TT_COMPAT = { minecraft: '26.2', neoforge: '26.2', javaMin: 21 };
export const TT_WEBSITE = 'https://tt-client-oogley.vercel.app';
export const MS_CLIENT_ID = process.env.TT_MS_CLIENT_ID || '';
export const MODRINTH_API = 'https://api.modrinth.com/v2';
export const MODRINTH_USER_AGENT = 'TT-Launcher/1.7.0';
export const DEFAULT_MEMORY_MB = 4096;
export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 720;
export const BUNDLED = { ttJar: 'ttclient.jar', ttPack: 'TT-Client-ResourcePack.zip' };

export function ttJarCandidates(loader: TtLoader): string[] {
  if (loader === 'fabric') return ['ttclient-fabric.jar', 'ttclient.jar'];
  return ['ttclient-neoforge.jar', 'ttclient.jar'];
}
