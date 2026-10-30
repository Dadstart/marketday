import { exchangeCodeAsync, type AuthSessionResult, type DiscoveryDocument } from 'expo-auth-session';

import type { AuthProviderName, ProviderCredential } from './types';

type FinishAuthInput = {
  provider: AuthProviderName;
  result: AuthSessionResult;
  clientId: string;
  redirectUri: string;
  codeVerifier?: string;
  discovery: Pick<DiscoveryDocument, 'tokenEndpoint'>;
};

export async function sessionFromAuthResult(
  input: FinishAuthInput,
): Promise<ProviderCredential | null> {
  const { result } = input;

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return null;
  }
  if (result.type === 'locked') {
    throw new Error('Sign-in is already open.');
  }
  if (result.type === 'error') {
    throw new Error(describedError(result.params.error_description, result.error?.message));
  }
  if (result.type !== 'success') {
    throw new Error('Sign-in did not finish.');
  }

  let idToken = result.authentication?.idToken || result.params.id_token || '';

  if (!idToken && result.params.code) {
    if (!input.discovery.tokenEndpoint) {
      throw new Error('Sign-in could not reach the token service.');
    }
    if (!input.codeVerifier) {
      throw new Error('Sign-in could not be verified. Try again.');
    }

    const token = await exchangeCodeAsync(
      {
        clientId: input.clientId,
        code: result.params.code,
        redirectUri: input.redirectUri,
        extraParams: {
          code_verifier: input.codeVerifier,
        },
      },
      { tokenEndpoint: input.discovery.tokenEndpoint },
    );
    idToken = token.idToken ?? '';
  }

  if (!idToken) {
    throw new Error('Sign-in did not return an identity token.');
  }

  return {
    provider: input.provider,
    idToken,
  };
}

const MICROSOFT_CONFIDENTIAL_CLIENT_ERROR =
  'Microsoft requires a client secret for this redirect URI. In Entra, open Authentication, remove the URI from Web, and add the same URI under Single-page application. Then try sign-in again.';

export function errorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (message.includes('AADSTS70002') || message.includes("must include a 'client_secret'")) {
    return MICROSOFT_CONFIDENTIAL_CLIENT_ERROR;
  }
  if (message) {
    return message;
  }
  return fallback;
}

function describedError(description: string | undefined, fallback: string | undefined): string {
  const text = description?.trim() || fallback?.trim();
  return text || 'Sign-in failed.';
}
