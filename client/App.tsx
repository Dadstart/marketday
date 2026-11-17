import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { isWebSignInReturn } from './src/auth/webRedirect';
import { legalDocumentFromPath, type LegalDocumentName } from './src/legal';
import { LegalFooter } from './src/LegalFooter';
import { locationFromUrl, readBrowserLocation, writeBrowserLocation, type AppLocation } from './src/routes';
import { LegalDocumentScreen } from './src/screens/LegalDocumentScreen';
import { EventsScreen } from './src/screens/EventsScreen';
import { PublicEventsScreen } from './src/screens/PublicEventsScreen';
import { VendorProfileScreen } from './src/screens/VendorProfileScreen';
import { colors } from './src/theme';

const authPopup = WebBrowser.maybeCompleteAuthSession();

export default function App() {
  if (authPopup.type === 'success' && !isWebSignInReturn()) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function legalFromLocation(): LegalDocumentName | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  return legalDocumentFromPath(window.location.pathname);
}

function Root() {
  const { user, ready } = useAuth();
  const [legal, setLegal] = useState<LegalDocumentName | null>(() => legalFromLocation());
  const [location, setLocation] = useState<AppLocation>(() => readBrowserLocation());

  const visit = useCallback((next: AppLocation, mode: 'push' | 'replace' = 'push') => {
    writeBrowserLocation(next, mode);
    setLocation(next);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const onPop = () => setLocation(readBrowserLocation());
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
    let active = true;
    Linking.getInitialURL()
      .then((url) => {
        if (active && url) {
          setLocation(locationFromUrl(url));
        }
      })
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', (event) => {
      setLocation(locationFromUrl(event.url));
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  function closeLegal() {
    setLegal(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && legalDocumentFromPath(window.location.pathname)) {
      window.history.pushState({}, '', '/');
      setLocation({ screen: 'events' });
    }
  }

  const needsProfile = Boolean(user && !user.admin && (!user.profileComplete || !user.profileReviewed));
  let screen = <PublicEventsScreen location={location} onLocation={visit} />;
  if (needsProfile) {
    screen = <VendorProfileScreen />;
  } else if (user) {
    screen = <EventsScreen location={location} onLocation={visit} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.main}>
        {legal ? (
          <LegalDocumentScreen name={legal} onBack={closeLegal} />
        ) : ready ? (
          screen
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
      </View>
      <LegalFooter onOpen={setLegal} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  main: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
