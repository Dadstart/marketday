import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  background: '#F3EDE3',
  card: '#FFFCF8',
  ink: '#1C1915',
  muted: '#6F655C',
  line: '#E4D9CC',
  accent: '#C4512C',
  inverse: '#1C1915',
  inverseText: '#FFFCF8',
  dangerBackground: '#F8E8E4',
  danger: '#8C2F2F',
};

export const serif: TextStyle = {
  fontFamily: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia, "Iowan Old Style", Palatino, serif',
  }),
};

export const pointer: ViewStyle | undefined =
  Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : undefined;
