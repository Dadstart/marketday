import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

import { googleReversedClientScheme } from './googleScheme';

export const MICROSOFT_ISSUER = 'https://login.microsoftonline.com/common/v2.0';

export const MICROSOFT_SCOPES = ['openid', 'profile', 'email'];

const APP_SCHEME = 'marketday';

function readEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const googleWebClientId = readEnv(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
export const googleIosClientId = readEnv(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
export const googleAndroidClientId = readEnv(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);
export const microsoftClientId = readEnv(process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID);

export function googleClientIdForPlatform(): string | undefined {
  if (Platform.OS === 'ios') {
    return googleIosClientId;
  }
  if (Platform.OS === 'android') {
    return googleAndroidClientId;
  }
  return googleWebClientId;
}

export function googleClientIdEnvName(): string {
  if (Platform.OS === 'ios') {
    return 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID';
  }
  if (Platform.OS === 'android') {
    return 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID';
  }
  return 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';
}

export function isGoogleConfigured(): boolean {
  return Boolean(googleClientIdForPlatform());
}

export function isMicrosoftConfigured(): boolean {
  return Boolean(microsoftClientId);
}

export function microsoftRedirectUri(): string {
  return makeRedirectUri({
    scheme: APP_SCHEME,
    path: 'redirect',
  });
}

export function googleRedirectUri(): string {
  if (Platform.OS === 'web') {
    return makeRedirectUri({ path: 'redirect' });
  }

  const scheme = googleReversedClientScheme(googleClientIdForPlatform());
  if (scheme) {
    return `${scheme}:/oauthredirect`;
  }

  return makeRedirectUri({
    scheme: APP_SCHEME,
    path: 'redirect',
  });
}
