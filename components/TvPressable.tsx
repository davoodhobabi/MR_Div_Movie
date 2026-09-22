import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTvFocus } from '../lib/tv';

type TvPressableProps = PressableProps & {
  /** Disable TV focus ring (still pressable). */
  tvFocus?: boolean;
  style?: StyleProp<ViewStyle> | PressableProps['style'];
};

/** Pressable with D-pad focus ring on Android TV only. */
export function TvPressable({
  tvFocus = true,
  style,
  ...rest
}: TvPressableProps) {
  const focus = useTvFocus({ enabled: tvFocus });

  return (
    <Pressable
      {...rest}
      {...focus.props}
      style={(state) => {
        const resolved =
          typeof style === 'function' ? style(state) : style;
        return [resolved, focus.style];
      }}
    />
  );
}
