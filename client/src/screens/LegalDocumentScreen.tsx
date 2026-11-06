import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { legalDocuments, type LegalDocumentName } from '../legal';
import { colors, pointer, serif } from '../theme';

export function LegalDocumentScreen({
  name,
  onBack,
}: {
  name: LegalDocumentName;
  onBack: () => void;
}) {
  const document = legalDocuments[name];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable accessibilityRole="button" onPress={onBack} style={pointer}>
          <Text style={styles.back}>Community Day</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {document.title}
        </Text>
        {document.intro.map((paragraph) => (
          <Text key={paragraph} style={styles.body}>
            {paragraph}
          </Text>
        ))}
        {document.points.map((point, index) => (
          <Text key={point} style={styles.body}>
            {index + 1}. {point}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  column: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: 12,
  },
  back: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    ...serif,
    color: colors.ink,
    fontSize: 40,
    lineHeight: 46,
  },
  body: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
  },
});
