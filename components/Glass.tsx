import { BlurView, type BlurTint } from 'expo-blur';
import { useContext, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { GlassTargetContext } from '../context/GlassContext';

export const glassBorder = 'rgba(255,255,255,0.18)';
export const glassFill = 'rgba(255,255,255,0.05)';

type GlassProps = ViewProps & {
  intensity?: number;
  tint?: BlurTint;
  blurReductionFactor?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function Glass({
  intensity = 46,
  tint = 'systemUltraThinMaterialDark',
  blurReductionFactor,
  style,
  children,
  ...rest
}: GlassProps) {
  const blurTarget = useContext(GlassTargetContext);

  return (
    <BlurView
      intensity={intensity}
      tint={tint}
      blurMethod="dimezisBlurView"
      blurReductionFactor={blurReductionFactor}
      blurTarget={blurTarget ?? undefined}
      style={[styles.glass, style]}
      {...rest}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  glass: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glassBorder,
    backgroundColor: glassFill,
  },
});
