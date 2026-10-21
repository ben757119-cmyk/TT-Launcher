import { MODRINTH_API, MODRINTH_USER_AGENT } from './config';
import { log } from './logger';

async function mrFetch(path: string, init?: RequestInit): Promise<any> {
  const url = path.startsWith('http') ? path : `${MODRINTH_API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': MODRINTH_USER_AGENT,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.warn('Modrinth API error', { url, status: res.status, body: body.slice(0, 200) });
    throw new Error(`Modrinth ${res.status}: ${body.slice(0, 120)}`);
  }
  return res.json();
}

export interface MrSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: string;
  server_side: string;
  downloads: number;
  icon_url: string | null;
  project_type: string;
  date_modified: string;
  author?: string;
}

export async function searchProjects(opts: {
  query?: string;
  projectType: 'resourcepack' | 'mod' | 'shader';
  versions?: string[];
  loaders?: string[];
  limit?: number;
  offset?: number;
  index?: 'relevance' | 'downloads' | 'updated';
}): Promise<{ hits: MrSearchHit[]; total: number }> {
  const facets: string[][] = [[`project_type:${opts.projectType}`]];
  if (opts.versions?.length) {
    facets.push(opts.versions.map((v) => `versions:${v}`));
  }
  if (opts.loaders?.length) {
    facets.push(opts.loaders.map((l) => `categories:${l}`));
  }

  const params = new URLSearchParams();
  if (opts.query) params.set('query', opts.query);
  params.set('limit', String(opts.limit ?? 20));
  params.set('offset', String(opts.offset ?? 0));
  params.set('index', opts.index ?? 'relevance');
  params.set('facets', JSON.stringify(facets));

  const data = await mrFetch(`/search?${params}`);
  return { hits: data.hits || [], total: data.total_hits || 0 };
}

export async function getProject(idOrSlug: string): Promise<any> {
  return mrFetch(`/project/${encodeURIComponent(idOrSlug)}`);
}

export async function getVersions(
  idOrSlug: string,
  opts?: { loaders?: string[]; gameVersions?: string[] },
): Promise<any[]> {
  const params = new URLSearchParams();
  if (opts?.loaders?.length) params.set('loaders', JSON.stringify(opts.loaders));
  if (opts?.gameVersions?.length) params.set('game_versions', JSON.stringify(opts.gameVersions));
  const q = params.toString() ? `?${params}` : '';
  return mrFetch(`/project/${encodeURIComponent(idOrSlug)}/version${q}`);
}

export function pickCompatibleVersion(
  versions: any[],
  gameVersion: string,
  loader: 'neoforge' | 'forge' | 'fabric' | 'quilt' | null,
): any | null {
  for (const v of versions) {
    const games: string[] = v.game_versions || [];
    const loaders: string[] = v.loaders || [];
    const gameOk = games.includes(gameVersion) || games.some((g) => g.startsWith(gameVersion));
    if (!gameOk) continue;
    if (loader) {
      if (!loaders.includes(loader) && loaders.length > 0) continue;
    }
    return v;
  }
  return null;
}

export function primaryFile(version: any): { url: string; filename: string; size: number; hashes?: any } | null {
  const files = version?.files || [];
  const primary = files.find((f: any) => f.primary) || files[0];
  if (!primary?.url) return null;
  return {
    url: primary.url,
    filename: primary.filename,
    size: primary.size || 0,
    hashes: primary.hashes,
  };
}
