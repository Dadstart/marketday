import { Linking, Platform, Text, type TextStyle } from 'react-native';

import { descriptionSegments, type TextMarks } from '../description';
import { colors } from '../theme';

export function FormattedText({ value, style }: { value: string; style?: TextStyle }) {
  const segments = descriptionSegments(value);
  if (segments.length === 0) {
    return null;
  }

  return (
    <Text selectable style={style}>
      {segments.map((segment, index) => (
        <Text
          key={index}
          style={segmentStyle(segment.marks, segment.email != null)}
          accessibilityRole={segment.email ? 'link' : undefined}
          onPress={
            segment.email
              ? () => {
                  void Linking.openURL(`mailto:${segment.email}`);
                }
              : undefined
          }
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

function segmentStyle(marks: TextMarks, linked: boolean): TextStyle {
  return {
    fontWeight: marks.bold ? '700' : undefined,
    fontStyle: marks.italic ? 'italic' : undefined,
    textDecorationLine: marks.underline || linked ? 'underline' : undefined,
    fontSize: marks.fontSize,
    lineHeight: marks.fontSize ? Math.round(marks.fontSize * 1.4) : undefined,
    color: linked ? colors.accent : undefined,
    ...(linked && Platform.OS === 'web' ? ({ cursor: 'pointer' } as TextStyle) : null),
  };
}
