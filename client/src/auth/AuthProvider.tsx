import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { resumeWebRedirect } from './webRedirect';
import { errorMessage } from './sessionFromAuth';
import { clearSession, readSession, writeSession } from './storage';
import type { AuthProviderName, ProviderCredential, SessionUser } from './types';
import { useGoogleSignIn } from './useGoogleSignIn';
import { useMicrosoftSignIn } from './useMicrosoftSignIn';
import { createApiSession, fetchMe, isUnauthorized } from '../api/client';

type AuthContextValue = {
  user: SessionUser | null;
  token: string | null;
  ready: boolean;
  pending: AuthProviderName | null;
  error: string | null;
  googleConfigured: boolean;
  microsoftConfigured: boolean;
  googleReady: boolean;
  microsoftReady: boolean;
  googleRedirectUri: string;
  microsoftRedirectUri: string;
  signInWithGoogle: () => void;
  signInWithMicrosoft: () => void;
  signOut: () => void;
  updateUser: (user: SessionUser) => void;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const google = useGoogleSignIn();
  const microsoft = useMicrosoftSignIn();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<AuthProviderName | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function restore() {
      try {
        const credential = await resumeWebRedirect();
        if (!active) {
          return;
        }
        if (credential) {
          const session = await createApiSession(credential);
          if (!active) {
            return;
          }
          await writeSession(session);
          setToken(session.token);
          setUser(session.user);
          setReady(true);
          return;
        }
      } catch (reason) {
        if (!active) {
          return;
        }
        setError(errorMessage(reason, 'Sign-in failed.'));
        setReady(true);
        return;
      }

      const session = await readSession();
      if (!active) {
        return;
      }
      if (!session) {
        setReady(true);
        return;
      }

      try {
        const current = await fetchMe(session.token);
        if (!active) {
          return;
        }
        setToken(session.token);
        setUser(current);
        await writeSession({ ...session, user: current });
      } catch (error) {
        if (!active) {
          return;
        }
        if (isUnauthorized(error)) {
          await clearSession();
        } else {
          setToken(session.token);
          setUser(session.user);
        }
      }
      setReady(true);
    }

    void restore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    WebBrowser.warmUpAsync();
    return () => {
      WebBrowser.coolDownAsync();
    };
  }, []);

  useEffect(() => {
    if (microsoft.configured && microsoft.discoveryError) {
      setError((current) => current ?? microsoft.discoveryError);
    }
  }, [microsoft.configured, microsoft.discoveryError]);

  const signIn = useCallback(
    (provider: AuthProviderName, prompt: () => Promise<ProviderCredential | null>) => {
      setError(null);
      setPending(provider);
      prompt()
        .then(async (credential) => {
          if (!credential) {
            return;
          }
          const session = await createApiSession(credential);
          await writeSession(session);
          setToken(session.token);
          setUser(session.user);
        })
        .catch((reason: unknown) => {
          setError(errorMessage(reason, 'Sign-in failed.'));
        })
        .finally(() => {
          setPending(null);
        });
    },
    [],
  );

  const signInWithGoogle = useCallback(() => {
    signIn('google', google.prompt);
  }, [google.prompt, signIn]);

  const signInWithMicrosoft = useCallback(() => {
    signIn('microsoft', microsoft.prompt);
  }, [microsoft.prompt, signIn]);

  const signOut = useCallback(() => {
    setError(null);
    clearSession()
      .then(() => {
        setToken(null);
        setUser(null);
      })
      .catch(() => {
        setError('Sign-out could not clear the saved session.');
      });
  }, []);

  const updateUser = useCallback((next: SessionUser) => {
    setUser(next);
    readSession()
      .then((session) => {
        if (!session) {
          return;
        }
        return writeSession({ ...session, user: next });
      })
      .catch(() => {
        setError('The vendor profile was saved, but this device could not keep the update.');
      });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      ready,
      pending,
      error,
      googleConfigured: google.configured,
      microsoftConfigured: microsoft.configured,
      googleReady: google.ready,
      microsoftReady: microsoft.ready,
      googleRedirectUri: google.redirectUri,
      microsoftRedirectUri: microsoft.redirectUri,
      signInWithGoogle,
      signInWithMicrosoft,
      signOut,
      updateUser,
      clearError,
    }),
    [
      clearError,
      error,
      google.configured,
      google.ready,
      google.redirectUri,
      microsoft.configured,
      microsoft.ready,
      microsoft.redirectUri,
      pending,
      ready,
      signInWithGoogle,
      signInWithMicrosoft,
      signOut,
      updateUser,
      token,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return value;
}
