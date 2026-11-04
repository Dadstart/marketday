import { AuthRequest, resolveDiscoveryAsync } from 'expo-auth-session';
import { Platform } from 'react-native';

import { MICROSOFT_ISSUER, MICROSOFT_SCOPES } from './config';
import { sessionFromAuthResult } from './sessionFromAuth';
import type { ProviderCredential } from './types';

const STORAGE_KEY = 'marketday.microsoft.redirect';

type PendingMicrosoftRedirect = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
};

/**
 * Microsoft closes the link between a popup and this page, so the login
 * result never comes back. Send the current window to Microsoft instead,
 * and finish sign-in when that window returns.
 */
export function startMicrosoftWebRedirect(request: AuthRequest, clientId: string, redirectUri: string): void {
  if (Platform.OS !== 'web') {
    throw new Error('Microsoft sign-in on this device uses the system browser.');
  }
  if (!request.url || !request.codeVerifier || !request.state) {
    throw new Error('Microsoft sign-in is not ready.');
  }

  const pending: PendingMicrosoftRedirect = {
    state: request.state,
    codeVerifier: request.codeVerifier,
    redirectUri,
    clientId,
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  window.location.assign(request.url);
}

let resumePromise: Promise<ProviderCredential | null> | null = null;

export function resumeMicrosoftWebRedirect(): Promise<ProviderCredential | null> {
  if (Platform.OS !== 'web') {
    return Promise.resolve(null);
  }
  resumePromise ??= resumeOnce();
  return resumePromise;
}

async function resumeOnce(): Promise<ProviderCredential | null> {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw || !returnHasAuthParams()) {
    return null;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
  const returnUrl = window.location.href;
  clearAuthReturn();

  const pending = parsePending(raw);
  if (!pending) {
    throw new Error('Sign-in could not be verified. Try again.');
  }

  const request = new AuthRequest({
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    scopes: [...MICROSOFT_SCOPES],
    state: pending.state,
    usePKCE: true,
  });
  request.codeVerifier = pending.codeVerifier;

  const discovery = await resolveDiscoveryAsync(MICROSOFT_ISSUER);
  return sessionFromAuthResult({
    provider: 'microsoft',
    result: request.parseReturnUrl(returnUrl),
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    codeVerifier: pending.codeVerifier,
    discovery,
  });
}

function returnHasAuthParams(): boolean {
  const current = new URL(window.location.href);
  const hash = new URLSearchParams(current.hash.replace(/^#/, ''));
  return ['code', 'error', 'id_token'].some((key) => current.searchParams.has(key) || hash.has(key));
}

function clearAuthReturn(): void {
  const current = new URL(window.location.href);
  for (const key of ['code', 'state', 'session_state', 'error', 'error_description', 'error_uri', 'id_token']) {
    current.searchParams.delete(key);
  }
  current.hash = '';
  if (current.pathname === '/redirect') {
    current.pathname = '/';
  }
  window.history.replaceState({}, document.title, `${current.pathname}${current.search}`);
}

function parsePending(raw: string): PendingMicrosoftRedirect | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') {
      return null;
    }
    const pending = value as PendingMicrosoftRedirect;
    if (
      typeof pending.state !== 'string' ||
      typeof pending.codeVerifier !== 'string' ||
      typeof pending.redirectUri !== 'string' ||
      typeof pending.clientId !== 'string' ||
      !pending.state ||
      !pending.codeVerifier ||
      !pending.redirectUri ||
      !pending.clientId
    ) {
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}
