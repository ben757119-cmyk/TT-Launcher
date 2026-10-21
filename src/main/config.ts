/**
 * TT Launcher configuration — release sources and compatibility metadata.
 * Edit these when TT Client publish locations change.
 */

export const LAUNCHER_VERSION = '1.0.0';

/** Official TT Client GitHub (private or public). Override via settings if needed. */
export const TT_GITHUB = {
  owner: 'ben757119-cmyk',
  repo: 'TT-Client',
  /** Prefer assets matching these patterns (first match wins). */
  jarPatterns: [
    /^ttclient[-_].*\.jar$/i,
    /^TT[-_]?Client.*\.jar$/i,
    /.*neoforge.*\.jar$/i,
    /.*\.jar$/i,
  ],
};

/** Compatibility declared for one-click install. */
export const TT_COMPAT = {
  minecraft: '26.2',
  neoforge: '26.2',
  javaMin: 21,
};

/** Official website (release notes / marketing). */
export const TT_WEBSITE = 'https://tt-client-oogley.vercel.app';

/**
 * Microsoft Azure App registration for Minecraft auth.
 * You MUST register your own app at https://portal.azure.com
 * and set the client ID. Device-code flow is used (no secret required).
 *
 * Redirect URI type: Public client / native
 * API permission: XboxLive.signin (delegated) is handled via msmc's Xbox Live path.
 *
 * Leave empty to show setup instructions in the Accounts UI.
 */
export const MS_CLIENT_ID = process.env.TT_MS_CLIENT_ID || '';

export const MODRINTH_API = 'https://api.modrinth.com/v2';
export const MODRINTH_USER_AGENT = 'TT-Launcher/1.0.0 (github.com/ben757119-cmyk/TT-Client)';

export const DEFAULT_MEMORY_MB = 4096;
export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 720;
