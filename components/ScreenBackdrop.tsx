import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

export function ScreenBackdrop() {
  return (
    <>
      <LinearGradient
        colors={['#1A0B10', colors.background, colors.background]}
        locations={[0, 0.38, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowRed} pointerEvents="none" />
      <View style={styles.glowWarm} pointerEvents="none" />
    </>
  );
}

const styles = StyleSheet.create({
  glowRed: {
    position: 'absolute',
    top: -80,
    end: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.glowRed,
  },
  glowWarm: {
    position: 'absolute',
    top: 120,
    start: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.glowWarm,
  },
});
