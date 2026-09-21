import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../constants/theme';

const TAB_BAR_BODY = 70;

export function useFloatingTabBarPadding(extra = 16) {
  const insets = useSafeAreaInsets();
  return TAB_BAR_BODY + spacing.lg + insets.bottom + extra;
}
