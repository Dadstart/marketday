import { AuthRequest, resolveDiscoveryAsync } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { Platform } from 'react-native';

import { MICROSOFT_ISSUER, MICROSOFT_SCOPES } from './config';
import { sessionFromAuthResult } from './sessionFromAuth';
import type { AuthProviderName, ProviderCredential } from './types';

const STORAGE_KEY = 'marketday.auth.redirect';
const MICROSOFT_STORAGE_KEY = 'marketday.microsoft.redirect';

type PendingWebRedirect = {
  provider: AuthProviderName;
  state: string;
  codeVerifier: string | null;
  redirectUri: string;
  clientId: string;
};

/**
 * Google and Microsoft both close the link between a popup and this page, so
 * the login result never comes back. Send the current window to the provider
 * instead, and finish sign-in when that window returns.
 */
export function startWebRedirect(input: {
  provider: AuthProviderName;
  request: AuthRequest;
  clientId: string;
  redirectUri: string;
}): void {
  if (Platform.OS !== 'web') {
    throw new Error('Sign-in on this device uses the system browser.');
  }
  if (!input.request.url || !input.request.state) {
    throw new Error('Sign-in is not ready.');
  }
  if (input.provider === 'microsoft' && !input.request.codeVerifier) {
    throw new Error('Sign-in could not be verified. Try again.');
  }

  const pending: PendingWebRedirect = {
    provider: input.provider,
    state: input.request.state,
    codeVerifier: input.request.codeVerifier ?? null,
    redirectUri: input.redirectUri,
    clientId: input.clientId,
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  window.location.assign(input.request.url);
}

export function isWebSignInReturn(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }
  return Boolean(readPendingRaw()) && returnHasAuthParams();
}

let resumePromise: Promise<ProviderCredential | null> | null = null;

export function resumeWebRedirect(): Promise<ProviderCredential | null> {
  if (Platform.OS !== 'web') {
    return Promise.resolve(null);
  }
  resumePromise ??= resumeOnce();
  return resumePromise;
}

async function resumeOnce(): Promise<ProviderCredential | null> {
  const raw = readPendingRaw();
  if (!raw || !returnHasAuthParams()) {
    return null;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(MICROSOFT_STORAGE_KEY);
  const returnUrl = window.location.href;
  clearAuthReturn();

  const pending = parsePending(raw);
  if (!pending) {
    throw new Error('Sign-in could not be verified. Try again.');
  }

  const request = new AuthRequest({
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    scopes: pending.provider === 'google' ? ['openid', 'profile', 'email'] : [...MICROSOFT_SCOPES],
    state: pending.state,
    usePKCE: pending.provider === 'microsoft',
  });
  if (pending.codeVerifier) {
    request.codeVerifier = pending.codeVerifier;
  }

  const discovery =
    pending.provider === 'google' ? Google.discovery : await resolveDiscoveryAsync(MICROSOFT_ISSUER);
  return sessionFromAuthResult({
    provider: pending.provider,
    result: request.parseReturnUrl(returnUrl),
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    codeVerifier: pending.codeVerifier ?? undefined,
    discovery,
  });
}

function readPendingRaw(): string | null {
  return window.sessionStorage.getItem(STORAGE_KEY) ?? window.sessionStorage.getItem(MICROSOFT_STORAGE_KEY);
}

function returnHasAuthParams(): boolean {
  const current = new URL(window.location.href);
  const hash = new URLSearchParams(current.hash.replace(/^#/, ''));
  return ['code', 'error', 'id_token'].some((key) => current.searchParams.has(key) || hash.has(key));
}

function clearAuthReturn(): void {
  const current = new URL(window.location.href);
  for (const key of [
    'code',
    'state',
    'session_state',
    'scope',
    'authuser',
    'prompt',
    'error',
    'error_description',
    'error_uri',
    'id_token',
  ]) {
    current.searchParams.delete(key);
  }
  current.hash = '';
  if (current.pathname === '/redirect') {
    current.pathname = '/';
  }
  window.history.replaceState({}, document.title, `${current.pathname}${current.search}`);
}

function parsePending(raw: string): PendingWebRedirect | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') {
      return null;
    }
    const pending = value as Partial<PendingWebRedirect>;
    const provider = pending.provider === 'google' || pending.provider === 'microsoft' ? pending.provider : 'microsoft';
    if (
      typeof pending.state !== 'string' ||
      typeof pending.redirectUri !== 'string' ||
      typeof pending.clientId !== 'string' ||
      !pending.state ||
      !pending.redirectUri ||
      !pending.clientId
    ) {
      return null;
    }
    if (pending.codeVerifier != null && typeof pending.codeVerifier !== 'string') {
      return null;
    }
    if (provider === 'microsoft' && !pending.codeVerifier) {
      return null;
    }
    return {
      provider,
      state: pending.state,
      codeVerifier: pending.codeVerifier ?? null,
      redirectUri: pending.redirectUri,
      clientId: pending.clientId,
    };
  } catch {
    return null;
  }
}
