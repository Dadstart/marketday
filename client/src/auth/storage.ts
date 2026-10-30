import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { StoredSession } from './types';

const SESSION_KEY = 'marketday.session';

export async function readSession(): Promise<StoredSession | null> {
  try {
    const raw = await readValue();
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredSession(parsed)) {
      await clearSession();
      return null;
    }

    if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
      await clearSession();
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function writeSession(session: StoredSession): Promise<void> {
  const raw = JSON.stringify(session);
  if (Platform.OS === 'web') {
    localStorage.setItem(SESSION_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, raw);
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

async function readValue(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(SESSION_KEY);
  }
  return SecureStore.getItemAsync(SESSION_KEY);
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as StoredSession;
  const user = session.user;
  if (!user || typeof user !== 'object') {
    return false;
  }

  if (user.provider !== 'google' && user.provider !== 'microsoft') {
    return false;
  }
  if (typeof user.id !== 'string' || user.id.length === 0) {
    return false;
  }
  if (typeof user.name !== 'string' || user.name.length === 0) {
    return false;
  }
  if (typeof user.admin !== 'boolean') {
    return false;
  }
  if (user.email != null && typeof user.email !== 'string') {
    return false;
  }
  if (user.picture != null && typeof user.picture !== 'string') {
    return false;
  }
  if (typeof session.token !== 'string' || session.token.length === 0) {
    return false;
  }
  if (typeof session.expiresAt !== 'number' || session.expiresAt <= 0) {
    return false;
  }

  return true;
}
