import type { Ref } from 'react';
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import { useTvFocus } from '../lib/tv';

type TvPressableProps = PressableProps & {
  /** Disable TV focus ring (still pressable). */
  tvFocus?: boolean;
  style?: StyleProp<ViewStyle> | PressableProps['style'];
  hostRef?: Ref<View>;
};

/** Pressable with D-pad focus ring on Android TV only. */
export function TvPressable({
  tvFocus = true,
  style,
  onFocus,
  onBlur,
  hostRef,
  ...rest
}: TvPressableProps) {
  const focus = useTvFocus({ enabled: tvFocus });

  return (
    <Pressable
      ref={hostRef}
      {...rest}
      {...focus.props}
      onFocus={(event) => {
        focus.props.onFocus?.();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focus.props.onBlur?.();
        onBlur?.(event);
      }}
      style={(state) => {
        const resolved =
          typeof style === 'function' ? style(state) : style;
        return [resolved, focus.style];
      }}
    />
  );
}
