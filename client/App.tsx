import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { isWebSignInReturn } from './src/auth/webRedirect';
import { legalDocumentFromPath, type LegalDocumentName } from './src/legal';
import { LegalFooter } from './src/LegalFooter';
import { LegalDocumentScreen } from './src/screens/LegalDocumentScreen';
import { EventsScreen } from './src/screens/EventsScreen';
import { PublicEventsScreen } from './src/screens/PublicEventsScreen';
import { VendorProfileScreen } from './src/screens/VendorProfileScreen';
import { colors } from './src/theme';

const authPopup = WebBrowser.maybeCompleteAuthSession();
const resumeEventKey = 'marketday.resumeEvent';

function readResumeEvent(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage.getItem(resumeEventKey);
  } catch {
    return null;
  }
}

function writeResumeEvent(eventId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (eventId) {
      window.sessionStorage.setItem(resumeEventKey, eventId);
    } else {
      window.sessionStorage.removeItem(resumeEventKey);
    }
  } catch {
    // Sign-in still works if the browser blocks storage. The event list stays available.
  }
}

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
  const [resumeEventId, setResumeEventId] = useState<string | null>(() => readResumeEvent());
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (user) {
      wasSignedIn.current = true;
      writeResumeEvent(null);
      return;
    }
    if (wasSignedIn.current) {
      wasSignedIn.current = false;
      setResumeEventId(null);
    }
  }, [user]);

  function viewEvent(eventId: string | null) {
    writeResumeEvent(eventId);
    setResumeEventId(eventId);
  }

  function closeLegal() {
    setLegal(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && legalDocumentFromPath(window.location.pathname)) {
      window.history.pushState({}, '', '/');
    }
  }

  let screen = <PublicEventsScreen onViewingEvent={viewEvent} />;
  if (user && !user.admin && !user.profileComplete) {
    screen = <VendorProfileScreen />;
  } else if (user) {
    screen = <EventsScreen initialEventId={resumeEventId} />;
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
