import { Ionicons } from '@expo/vector-icons';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type ViewToken,
} from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { useLayout } from '../lib/layout';
import { useIsTv } from '../lib/tv';
import { Glass } from './Glass';
import { TvPressable } from './TvPressable';

type HomeCarouselProps<T> = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onSeeAll?: () => void;
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: { item: T; active: boolean }) => ReactElement | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  /** Estimated card width for getItemLayout (defaults to layout posterWidth). */
  itemWidth?: number;
};

export function HomeCarousel<T>({
  title,
  icon,
  iconColor = colors.accent,
  onSeeAll,
  data,
  keyExtractor,
  renderItem,
  empty = false,
  emptyTitle,
  emptyHint,
  itemWidth: _itemWidth,
}: HomeCarouselProps<T>) {
  const { gutter, gridGap } = useLayout();
  const isTv = useIsTv();
  const initialVisible = isTv ? 5 : 6;

  const seedActive = useCallback(() => {
    const next = new Set<string>();
    for (let i = 0; i < Math.min(initialVisible, data.length); i += 1) {
      next.add(keyExtractor(data[i], i));
    }
    return next;
  }, [data, initialVisible, keyExtractor]);

  const [activeKeys, setActiveKeys] = useState<Set<string>>(seedActive);

  useEffect(() => {
    setActiveKeys(seedActive());
  }, [seedActive]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 40,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setActiveKeys((prev) => {
        const next = new Set<string>();
        for (const token of viewableItems) {
          if (token.key != null) next.add(String(token.key));
        }
        // Keep a small look-ahead so scrolling feels instant.
        if (next.size === 0) return prev;
        let changed = prev.size !== next.size;
        if (!changed) {
          for (const key of next) {
            if (!prev.has(key)) {
              changed = true;
              break;
            }
          }
        }
        return changed ? next : prev;
      });
    },
  ).current;

  const listRenderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<T>) => {
      const key = keyExtractor(item, index);
      const active = activeKeys.has(key) || index < initialVisible;
      return renderItem({ item, active });
    },
    [activeKeys, initialVisible, keyExtractor, renderItem],
  );

  return (
    <View style={styles.section}>
      <View style={[styles.header, { paddingHorizontal: gutter }]}>
        <View style={styles.titleRow}>
          <Ionicons name={icon} size={16} color={iconColor} />
          <Text style={styles.title}>{title}</Text>
        </View>
        {onSeeAll ? (
          <TvPressable
            onPress={onSeeAll}
            hitSlop={8}
            style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={strings.seeAll}
          >
            <Text style={styles.seeAllText}>{strings.seeAll}</Text>
            <Ionicons name="chevron-back" size={14} color={colors.textMuted} />
          </TvPressable>
        ) : null}
      </View>

      {empty ? (
        <Glass style={[styles.empty, { marginHorizontal: gutter }]}>
          <View style={styles.emptyIcon}>
            <Ionicons name={icon} size={22} color={iconColor} />
          </View>
          {emptyTitle ? <Text style={styles.emptyTitle}>{emptyTitle}</Text> : null}
          {emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null}
        </Glass>
      ) : (
        <FlatList
          horizontal
          data={data}
          keyExtractor={keyExtractor}
          renderItem={listRenderItem}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.track,
            { paddingHorizontal: gutter, gap: gridGap },
          ]}
          style={styles.scroller}
          initialNumToRender={initialVisible}
          maxToRenderPerBatch={isTv ? 3 : 4}
          windowSize={isTv ? 2 : 3}
          updateCellsBatchingPeriod={isTv ? 120 : 50}
          removeClippedSubviews={Platform.OS !== 'web'}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  pressed: {
    opacity: 0.75,
  },
  scroller: {},
  track: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  empty: {
    borderRadius: radii.card,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
});
