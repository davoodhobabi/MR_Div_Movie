import { useWindowDimensions } from 'react-native';
import { spacing } from '../constants/theme';
import { isAndroidTv } from './tv';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTv = isAndroidTv();
  const isTablet = !isTv && width >= 700;
  const isDesktop = !isTv && width >= 1100;
  const gutter = isTv ? 48 : isDesktop ? 40 : isTablet ? 28 : spacing.lg;
  const columns = isTv
    ? width >= 1600
      ? 7
      : width >= 1200
        ? 6
        : 5
    : width >= 1400
      ? 6
      : isDesktop
        ? 5
        : isTablet
          ? 3
          : 2;
  const gridGap = isTv ? 18 : isDesktop ? 16 : 12;
  const posterWidth = isTv ? 168 : isDesktop ? 176 : isTablet ? 156 : 140;

  return {
    width,
    height,
    isTv,
    isTablet,
    isDesktop,
    gutter,
    columns,
    gridGap,
    posterWidth,
  };
}
