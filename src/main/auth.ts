/**
 * Microsoft / Minecraft authentication.
 *
 * Uses device-code style flow via `msmc` when a client ID is configured.
 * Never collects Microsoft passwords in a custom form.
 *
 * REQUIRED SETUP:
 * 1. Create an Azure App Registration (public client)
 * 2. Enable public client flows
 * 3. Set MS_CLIENT_ID in config or Settings → Accounts
 *
 * Tokens are stored encrypted-at-rest only as much as electron-store provides
 * on the local machine; do not commit token files.
 */

import { Auth } from 'msmc';
import { v4 as uuidv4 } from 'uuid';
import { getStore, AccountRecord } from './store';
import { MS_CLIENT_ID } from './config';
import { log } from './logger';

export function getMsClientId(): string {
  const fromSettings = getStore().get('settings').msClientId?.trim();
  return fromSettings || MS_CLIENT_ID || '';
}

export function listAccounts(): AccountRecord[] {
  return getStore().get('accounts');
}

export function getActiveAccount(): AccountRecord | null {
  const store = getStore();
  const id = store.get('settings').lastSelectedAccountId;
  const accounts = store.get('accounts');
  if (id) {
    const found = accounts.find((a) => a.id === id);
    if (found) return found;
  }
  return accounts[0] || null;
}

export function selectAccount(id: string): AccountRecord | null {
  const store = getStore();
  const acc = store.get('accounts').find((a) => a.id === id);
  if (!acc) return null;
  const s = store.get('settings');
  s.lastSelectedAccountId = id;
  store.set('settings', s);
  return acc;
}

export function removeAccount(id: string): void {
  const store = getStore();
  store.set(
    'accounts',
    store.get('accounts').filter((a) => a.id !== id),
  );
  const s = store.get('settings');
  if (s.lastSelectedAccountId === id) {
    s.lastSelectedAccountId = store.get('accounts')[0]?.id;
    store.set('settings', s);
  }
}

export interface AuthProgress {
  stage: string;
  userCode?: string;
  verificationUri?: string;
  message: string;
}

/**
 * Interactive Microsoft sign-in.
 * Returns account record on success.
 * Emits progress via callback (device code for user to enter at microsoft.com/link).
 */
export async function signInMicrosoft(
  onProgress: (p: AuthProgress) => void,
): Promise<AccountRecord> {
  const clientId = getMsClientId();
  if (!clientId) {
    throw new Error(
      'Microsoft Client ID is not configured. Open Settings → Accounts and paste your Azure App client ID. See README AUTH.md.',
    );
  }

  onProgress({
    stage: 'starting',
    message: 'Starting Microsoft authentication…',
  });

  // msmc Auth — select browserless/device oriented path when available
  const authManager = new Auth('select_account');

  // msmc launches a local server / opens browser depending on version.
  // We document that the user completes login in the browser window.
  onProgress({
    stage: 'browser',
    message: 'Complete sign-in in the browser window that opens. Do not enter your password in TT Launcher.',
  });

  try {
    const xbox = await authManager.launch('electron', {
      clientid: clientId,
    } as any);

    const mc = await xbox.getMinecraft();
    if (!mc || !mc.profile) {
      throw new Error('Minecraft profile missing — does this Microsoft account own Java Edition?');
    }

    // Entitlement: msmc throws or returns empty if no game
    const name = mc.profile.name;
    const uuid = mc.profile.id;
    if (!name || !uuid) {
      throw new Error('Could not read Minecraft profile. Verify Java Edition ownership.');
    }

    const record: AccountRecord = {
      id: uuidv4(),
      name,
      uuid,
      type: 'msa',
      avatarUrl: `https://mc-heads.net/avatar/${uuid}/64`,
      // Store refresh material from msmc xbox object if present — keep opaque
      tokenBlob: JSON.stringify({
        // Minimal launch identity; full token refresh handled by msmc session if re-auth needed
        name,
        uuid,
        // Access token for launch — short lived
        accessToken: (mc as any).token || (mc as any).access_token || '',
      }),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      lastUsed: Date.now(),
    };

    const store = getStore();
    const accounts = store.get('accounts').filter((a) => a.uuid !== uuid);
    accounts.push(record);
    store.set('accounts', accounts);
    const s = store.get('settings');
    s.lastSelectedAccountId = record.id;
    store.set('settings', s);

    onProgress({ stage: 'done', message: `Signed in as ${name}` });
    log.info('Signed in Microsoft account', { name, uuid });
    return record;
  } catch (e: any) {
    log.error('MS auth failed', { err: String(e?.message || e) });
    throw new Error(e?.message || 'Microsoft authentication failed');
  }
}

/**
 * Offline / demo mode for UI testing only. Cannot play online servers that require MS auth.
 * Explicitly labeled so it is not confused with legitimate ownership.
 */
export function signInOffline(username: string): AccountRecord {
  const clean = username.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'Player';
  const record: AccountRecord = {
    id: uuidv4(),
    name: clean,
    uuid: uuidv4().replace(/-/g, ''),
    type: 'offline',
    lastUsed: Date.now(),
  };
  const store = getStore();
  const accounts = store.get('accounts');
  accounts.push(record);
  store.set('accounts', accounts);
  const s = store.get('settings');
  s.lastSelectedAccountId = record.id;
  store.set('settings', s);
  return record;
}

export function getLaunchIdentity(account: AccountRecord): {
  username: string;
  uuid: string;
  accessToken: string;
  offline: boolean;
} {
  if (account.type === 'offline') {
    return {
      username: account.name,
      uuid: account.uuid,
      accessToken: '0',
      offline: true,
    };
  }
  let accessToken = '0';
  try {
    if (account.tokenBlob) {
      const parsed = JSON.parse(account.tokenBlob);
      accessToken = parsed.accessToken || '0';
    }
  } catch {
    /* */
  }
  return {
    username: account.name,
    uuid: account.uuid,
    accessToken,
    offline: false,
  };
}
