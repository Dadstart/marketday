import { ResponseType } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';

import {
  googleAndroidClientId,
  googleClientIdForPlatform,
  googleIosClientId,
  googleRedirectUri,
  googleWebClientId,
  isGoogleConfigured,
} from './config';
import { sessionFromAuthResult } from './sessionFromAuth';
import type { ProviderCredential } from './types';
import { startWebRedirect } from './webRedirect';

const UNCONFIGURED_CLIENT_ID = 'unconfigured';

export function useGoogleSignIn() {
  const redirectUri = useMemo(() => googleRedirectUri(), []);
  const configured = isGoogleConfigured();
  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId: googleWebClientId ?? UNCONFIGURED_CLIENT_ID,
    iosClientId: googleIosClientId ?? UNCONFIGURED_CLIENT_ID,
    androidClientId: googleAndroidClientId ?? UNCONFIGURED_CLIENT_ID,
    redirectUri,
    selectAccount: true,
    shouldAutoExchangeCode: false,
    responseType: Platform.OS === 'web' ? ResponseType.IdToken : ResponseType.Code,
  });

  const prompt = useCallback(async (): Promise<ProviderCredential | null> => {
    const clientId = googleClientIdForPlatform();
    if (!configured || !clientId || !request) {
      throw new Error('Google sign-in is not configured.');
    }

    if (Platform.OS === 'web') {
      startWebRedirect({
        provider: 'google',
        request,
        clientId,
        redirectUri,
      });
      return new Promise<ProviderCredential | null>(() => {
        // The browser leaves this page for Google and comes back at the redirect URI.
      });
    }

    const result = await promptAsync();
    return sessionFromAuthResult({
      provider: 'google',
      result,
      clientId,
      redirectUri,
      codeVerifier: request.codeVerifier,
      discovery: Google.discovery,
    });
  }, [configured, promptAsync, redirectUri, request]);

  return {
    configured,
    ready: configured && request != null,
    redirectUri,
    prompt,
  };
}
