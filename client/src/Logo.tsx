import { Image, StyleSheet } from 'react-native';

const source = require('../assets/logo.png');

export function Logo() {
  return (
    <Image
      accessibilityRole="image"
      accessibilityLabel="Crosswinds"
      source={source}
      resizeMode="contain"
      style={styles.logo}
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 200,
    height: 43,
    marginBottom: 8,
  },
});
