import type { ConfigContext, ExpoConfig } from 'expo/config';

// Keep in sync with src/auth/googleScheme.ts. The Expo config loader cannot import that module.
const GOOGLE_CLIENT_SUFFIX = '.apps.googleusercontent.com';

function googleReversedClientScheme(clientId: string | undefined): string | undefined {
  const trimmed = clientId?.trim();
  if (!trimmed?.endsWith(GOOGLE_CLIENT_SUFFIX)) {
    return undefined;
  }

  const prefix = trimmed.slice(0, -GOOGLE_CLIENT_SUFFIX.length);
  return prefix ? `com.googleusercontent.apps.${prefix}` : undefined;
}

const googleSchemes = [
  googleReversedClientScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  googleReversedClientScheme(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
].filter((scheme): scheme is string => Boolean(scheme));

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Market Day',
  slug: 'marketday',
  scheme: ['marketday', ...new Set(googleSchemes)],
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.marketday.app',
  },
  android: {
    package: 'com.marketday.app',
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      backgroundColor: '#F3EDE3',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: ['expo-web-browser', 'expo-secure-store'],
});
