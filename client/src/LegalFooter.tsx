import { Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { type LegalDocumentName } from './legal';
import { colors } from './theme';

export function LegalFooter({ onOpen }: { onOpen: (name: LegalDocumentName) => void }) {
  return (
    <View style={styles.footer}>
      <LegalLink href="/privacy.html" onOpen={() => onOpen('privacy')}>
        Privacy
      </LegalLink>
      <Text style={styles.separator}>·</Text>
      <LegalLink href="/tos.html" onOpen={() => onOpen('terms')}>
        Terms of Service
      </LegalLink>
    </View>
  );
}

function LegalLink({
  href,
  onOpen,
  children,
}: {
  href: string;
  onOpen: () => void;
  children: string;
}) {
  return (
    <Text
      accessibilityRole="link"
      style={styles.link}
      {...(Platform.OS === 'web'
        ? { href }
        : {
            onPress: onOpen,
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
