import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, PixelRatio, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, spacing } from '../constants/theme';
import { useCatalog } from '../context/CatalogContext';
import { filterCatalog } from '../lib/catalog/search';
import type { IndexedCatalogItem } from '../lib/catalog/types';
import { useFloatingTabBarPadding } from '../lib/tabBarInset';
import { Glass } from './Glass';
import { HomeTitleCard } from './HomeTitleCard';
import { SearchBar } from './SearchBar';

const COLUMNS = 2;
const GRID_GAP = 12;

type CatalogBrowseListProps = {
  items: IndexedCatalogItem[];
  title: string;
  emptyIcon: keyof typeof Ionicons.glyphMap;
  emptyTitle: string;
  emptyHint?: string;
  searchable?: boolean;
};

export function CatalogBrowseList({
  items,
  title,
  emptyIcon,
  emptyTitle,
  emptyHint,
  searchable = true,
}: CatalogBrowseListProps) {
  const { isFavorite, toggleFavorite } = useCatalog();
  const [query, setQuery] = useState('');
  const tabBarPad = useFloatingTabBarPadding();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.floor(
    PixelRatio.roundToNearestPixel(
      (screenWidth - spacing.lg * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS,
    ),
  );

  const visible = useMemo(
    () => (query.trim() ? filterCatalog(items, query) : items),
    [items, query],
  );

  const openTitle = (item: IndexedCatalogItem) => {
    router.push({
      pathname: '/title/[id]',
      params: { id: item.imdbId },
    });
  };

  const countLabel = strings.browseCount(visible.length.toLocaleString('fa-IR'));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{countLabel}</Text>
      </View>
      {searchable ? (
        <View style={styles.searchWrap}>
          <SearchBar
            onChangeQuery={setQuery}
            onSubmit={setQuery}
            placeholder={strings.browseSearchPlaceholder}
          />
        </View>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={(item) => `${item.imdbId}-${item.index}`}
        numColumns={COLUMNS}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: tabBarPad }]}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={5}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        renderItem={({ item }) => (
          <HomeTitleCard
            item={item}
            width={cardWidth}
            favorited={isFavorite(item.imdbId)}
            onToggleFavorite={() => toggleFavorite(item.imdbId)}
            onPress={() => openTitle(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Glass style={styles.emptyIcon}>
              <Ionicons name={emptyIcon} size={28} color={colors.accent} />
            </Glass>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            {emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.bold,
  },
  count: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  empty: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
});
