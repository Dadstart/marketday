const GOOGLE_CLIENT_SUFFIX = '.apps.googleusercontent.com';

/**
 * Google iOS and Android clients redirect to the reversed client id.
 * `123-abc.apps.googleusercontent.com` becomes
 * `com.googleusercontent.apps.123-abc`.
 */
export function googleReversedClientScheme(clientId: string | undefined): string | undefined {
  const trimmed = clientId?.trim();
  if (!trimmed?.endsWith(GOOGLE_CLIENT_SUFFIX)) {
    return undefined;
  }

  const prefix = trimmed.slice(0, -GOOGLE_CLIENT_SUFFIX.length);
  if (!prefix) {
    return undefined;
  }

  return `com.googleusercontent.apps.${prefix}`;
}
