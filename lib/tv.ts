import { useCallback, useState } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';

/** True on Android TV / Fire TV leanback devices. Phone/tablet stay false. */
export function isAndroidTv(): boolean {
  return Platform.OS === 'android' && Platform.isTV === true;
}

export function useIsTv(): boolean {
  return isAndroidTv();
}

type TvFocusOptions = {
  /** When false, skips focusability (e.g. nested icon on a TV card). Default true on TV. */
  enabled?: boolean;
};

/**
 * D-pad focus props + ring style. No-op on phone so mobile UI is unchanged.
 */
export function useTvFocus(options: TvFocusOptions = {}) {
  const isTv = useIsTv();
  const enabled = options.enabled !== false && isTv;
  const [focused, setFocused] = useState(false);

  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);

  if (!enabled) {
    return {
      isTv,
      focused: false,
      props: {} as {
      focusable?: true;
      onFocus?: () => void;
      onBlur?: () => void;
    },
      style: undefined as ViewStyle | undefined,
    };
  }

  return {
    isTv,
    focused,
    props: {
      focusable: true as const,
      onFocus,
      onBlur,
    },
    style: (focused ? tvStyles.focusRing : undefined) as ViewStyle | undefined,
  };
}

export const tvStyles = StyleSheet.create({
  focusRing: {
    borderWidth: 3,
    borderColor: '#E50914',
  },
  focusSoft: {
    opacity: 1,
    transform: [{ scale: 1.04 }],
  },
});
