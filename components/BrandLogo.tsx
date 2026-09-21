import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { strings } from '../constants/strings';

type BrandLogoProps = {
  /** `sm` = header (logo5), `lg` = splash (logo6) */
  size?: 'sm' | 'lg';
  style?: StyleProp<ViewStyle>;
};

const SOURCES = {
  sm: require('../assets/logo5.png'),
  lg: require('../assets/logo6.png'),
} as const;

const SIZES = {
  // logo5 879×543 — header
  sm: { width: 74, height: 46 },
  // logo6 651×528 — splash
  lg: { width: 260, height: 211 },
} as const;

export function BrandLogo({ size = 'lg', style }: BrandLogoProps) {
  const dims = SIZES[size];
  return (
    <View
      style={[styles.base, dims, style]}
      accessibilityRole="image"
      accessibilityLabel={strings.brand}
    >
      <Image
        source={SOURCES[size]}
        style={dims}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
