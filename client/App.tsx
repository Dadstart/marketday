import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { EventsScreen } from './src/screens/EventsScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { VendorProfileScreen } from './src/screens/VendorProfileScreen';
import { colors } from './src/theme';

const authPopup = WebBrowser.maybeCompleteAuthSession();

export default function App() {
  if (authPopup.type === 'success') {
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

function Root() {
  const { user, ready } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      {ready ? (
        user ? (
          user.admin || user.profileComplete ? (
            <EventsScreen />
          ) : (
            <VendorProfileScreen />
          )
        ) : (
          <SignInScreen />
        )
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
