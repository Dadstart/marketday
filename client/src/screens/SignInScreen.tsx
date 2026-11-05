import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { googleClientIdEnvName } from '../auth/config';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../Logo';
import { colors, pointer, serif } from '../theme';

export function SignInScreen() {
  const auth = useAuth();
  const missingEnv = [
    !auth.googleConfigured ? googleClientIdEnvName() : null,
    !auth.microsoftConfigured ? 'EXPO_PUBLIC_MICROSOFT_CLIENT_ID' : null,
  ].filter((name): name is string => Boolean(name));
  const showSetup = missingEnv.length > 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Logo />
        <Text style={styles.eyebrow}>COMMUNITY DAY</Text>
        <Text style={styles.title} accessibilityRole="header">
          Sign in
        </Text>
        <Text style={styles.body}>Use your Google or Microsoft account.</Text>

        {auth.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{auth.error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
              onPress={auth.clearError}
              style={pointer}
            >
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </Pressable>
          </View>
        ) : null}

        <AuthButton
          label={
            auth.googleConfigured && !auth.googleReady
              ? 'Preparing Google sign-in…'
              : 'Continue with Google'
          }
          mark="G"
          disabled={!auth.googleReady || auth.pending != null}
          busy={auth.pending === 'google'}
          onPress={auth.signInWithGoogle}
          variant="light"
        />
        <AuthButton
          label={
            auth.microsoftConfigured && !auth.microsoftReady
              ? 'Preparing Microsoft sign-in…'
              : 'Continue with Microsoft'
          }
          mark="M"
          disabled={!auth.microsoftReady || auth.pending != null}
          busy={auth.pending === 'microsoft'}
          onPress={auth.signInWithMicrosoft}
          variant="dark"
        />

        {showSetup ? (
          <View style={styles.setup}>
            <Text style={styles.setupTitle}>Add client IDs to .env, then restart Expo.</Text>
            {missingEnv.map((name) => (
              <Text key={name} selectable style={styles.envName}>
                {name}
              </Text>
            ))}
            <Text style={styles.setupTitle}>Register these redirect URIs.</Text>
            <RedirectRow label="Google" uri={auth.googleRedirectUri} />
            <RedirectRow label="Microsoft" uri={auth.microsoftRedirectUri} />
          </View>
        ) : (
          <RedirectDetails
            googleRedirectUri={auth.googleRedirectUri}
            microsoftRedirectUri={auth.microsoftRedirectUri}
          />
        )}
      </View>
    </ScrollView>
  );
}

function AuthButton({
  label,
  mark,
  disabled,
  busy,
  onPress,
  variant,
}: {
  label: string;
  mark: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
  variant: 'light' | 'dark';
}) {
  const light = variant === 'light';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        light ? styles.buttonLight : styles.buttonDark,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        pointer,
      ]}
    >
      <View style={[styles.monogram, light ? styles.monogramLight : styles.monogramDark]}>
        <Text style={[styles.monogramText, light ? styles.monogramTextLight : styles.monogramTextDark]}>
          {mark}
        </Text>
      </View>
      <Text style={[styles.buttonLabel, light ? styles.buttonLabelLight : styles.buttonLabelDark]}>
        {busy ? 'Waiting for the browser…' : label}
      </Text>
    </Pressable>
  );
}

function RedirectDetails({
  googleRedirectUri,
  microsoftRedirectUri,
}: {
  googleRedirectUri: string;
  microsoftRedirectUri: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={pointer}
      >
        <Text style={styles.showUris}>Show redirect URIs</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.redirects}>
      <Text style={styles.setupTitle}>Redirect URIs for this platform</Text>
      <RedirectRow label="Google" uri={googleRedirectUri} />
      <RedirectRow label="Microsoft" uri={microsoftRedirectUri} />
    </View>
  );
}

function RedirectRow({ label, uri }: { label: string; uri: string }) {
  return (
    <View style={styles.redirectRow}>
      <Text style={styles.redirectLabel}>{label}</Text>
      <Text selectable style={styles.redirectUri}>
        {uri}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  card: {
    width: '100%',
    maxWidth: 440,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.6,
    marginTop: 4,
    marginBottom: 8,
  },
  title: {
    ...serif,
    color: colors.ink,
    fontSize: 40,
    lineHeight: 46,
    marginBottom: 8,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
  },
  errorBox: {
    backgroundColor: colors.dangerBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  errorDismiss: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  buttonLight: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonDark: {
    backgroundColor: colors.inverse,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  monogram: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramLight: {
    backgroundColor: colors.background,
  },
  monogramDark: {
    backgroundColor: '#3A342E',
  },
  monogramText: {
    fontSize: 14,
    fontWeight: '700',
  },
  monogramTextLight: {
    color: colors.ink,
  },
  monogramTextDark: {
    color: colors.inverseText,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonLabelLight: {
    color: colors.ink,
  },
  buttonLabelDark: {
    color: colors.inverseText,
  },
  setup: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  redirects: {
    marginTop: 16,
    gap: 8,
  },
  setupTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  showUris: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 8,
  },
  envName: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    }),
  },
  redirectRow: {
    gap: 2,
  },
  redirectLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  redirectUri: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
});
