import { Linking, Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { colors } from './theme';

export function LegalFooter() {
  return (
    <View style={styles.footer}>
      <LegalLink href="/privacy.html">Privacy</LegalLink>
      <Text style={styles.separator}>·</Text>
      <LegalLink href="/tos.html">Terms of Service</LegalLink>
    </View>
  );
}

function LegalLink({ href, children }: { href: string; children: string }) {
  return (
    <Text
      accessibilityRole="link"
      style={styles.link}
      {...(Platform.OS === 'web'
        ? { href }
        : {
            onPress: () => {
              void Linking.openURL(href);
            },
          })}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  separator: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as TextStyle) : null),
  },
});
