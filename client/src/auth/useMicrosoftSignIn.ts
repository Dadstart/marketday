import {
  resolveDiscoveryAsync,
  useAuthRequest,
  type DiscoveryDocument,
} from 'expo-auth-session';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  MICROSOFT_ISSUER,
  MICROSOFT_SCOPES,
  isMicrosoftConfigured,
  microsoftClientId,
  microsoftRedirectUri,
} from './config';
import { sessionFromAuthResult } from './sessionFromAuth';
import type { ProviderCredential } from './types';

const UNCONFIGURED_CLIENT_ID = '00000000-0000-0000-0000-000000000000';

export function useMicrosoftSignIn() {
  const redirectUri = useMemo(() => microsoftRedirectUri(), []);
  const configured = isMicrosoftConfigured();
  const { discovery, error: discoveryError } = useIssuerDiscovery(MICROSOFT_ISSUER);
  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: microsoftClientId ?? UNCONFIGURED_CLIENT_ID,
      scopes: MICROSOFT_SCOPES,
      redirectUri,
      extraParams: {
        prompt: 'select_account',
      },
    },
    discovery,
  );

  const prompt = useCallback(async (): Promise<ProviderCredential | null> => {
    if (!configured || !microsoftClientId || !request || !discovery?.tokenEndpoint) {
      throw new Error('Microsoft sign-in is not configured.');
    }

    const result = await promptAsync();
    return sessionFromAuthResult({
      provider: 'microsoft',
      result,
      clientId: microsoftClientId,
      redirectUri,
      codeVerifier: request.codeVerifier,
      discovery,
    });
  }, [configured, discovery, promptAsync, redirectUri, request]);

  return {
    configured,
    ready: configured && request != null,
    redirectUri,
    discoveryError,
    prompt,
  };
}

function useIssuerDiscovery(issuer: string): {
  discovery: DiscoveryDocument | null;
  error: string | null;
} {
  const [discovery, setDiscovery] = useState<DiscoveryDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveDiscoveryAsync(issuer).then(
      (document) => {
        if (active) {
          setDiscovery(document);
        }
      },
      () => {
        if (active) {
          setError('Microsoft sign-in is unavailable right now.');
        }
      },
    );

    return () => {
      active = false;
    };
  }, [issuer]);

  return { discovery, error };
}
