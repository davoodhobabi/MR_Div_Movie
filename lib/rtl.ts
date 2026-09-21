import { I18nManager, Platform, type ViewStyle } from 'react-native';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'fa';
}

/** Native Yoga LTR lock. RN-web StyleSheet rejects `direction`, so this is empty there. */
export const ltrStyle: ViewStyle =
  Platform.OS === 'web' ? {} : { direction: 'ltr' };

/** Web CSS `dir` so row-reverse matches the native app instead of double-flipping. */
export const ltrProps = Platform.OS === 'web' ? { dir: 'ltr' as const } : {};
