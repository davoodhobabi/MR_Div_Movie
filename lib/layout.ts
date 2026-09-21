import { useWindowDimensions } from 'react-native';
import { spacing } from '../constants/theme';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 700;
  const isDesktop = width >= 1100;
  const gutter = isDesktop ? 40 : isTablet ? 28 : spacing.lg;
  const columns = width >= 1400 ? 6 : isDesktop ? 5 : isTablet ? 3 : 2;
  const gridGap = isDesktop ? 16 : 12;
  const posterWidth = isDesktop ? 176 : isTablet ? 156 : 140;

  return {
    width,
    height,
    isTablet,
    isDesktop,
    gutter,
    columns,
    gridGap,
    posterWidth,
  };
}
