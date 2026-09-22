import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, spacing } from '../constants/theme';
import { useCatalog } from '../context/CatalogContext';
import { filterCatalog } from '../lib/catalog/search';
import type { IndexedCatalogItem } from '../lib/catalog/types';
import { useLayout } from '../lib/layout';
import { useFloatingTabBarPadding } from '../lib/tabBarInset';
import { Glass } from './Glass';
import { HomeTitleCard } from './HomeTitleCard';
import { SearchBar } from './SearchBar';

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
  const { width, gutter, columns, gridGap, isTv } = useLayout();
  const cardWidth = Math.floor(
    PixelRatio.roundToNearestPixel(
      (width - gutter * 2 - gridGap * (columns - 1)) / columns,
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
      <View style={[styles.header, { paddingHorizontal: gutter }]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{countLabel}</Text>
      </View>
      {searchable ? (
        <View style={[styles.searchWrap, { paddingHorizontal: gutter }]}>
          <SearchBar
            onChangeQuery={setQuery}
            onSubmit={setQuery}
            placeholder={strings.browseSearchPlaceholder}
          />
        </View>
      ) : null}
      <FlatList
        key={`grid-${columns}`}
        data={visible}
        keyExtractor={(item) => `${item.imdbId}-${item.index}`}
        numColumns={columns}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.list,
          { paddingHorizontal: gutter, paddingBottom: tabBarPad },
        ]}
        columnWrapperStyle={[
          styles.row,
          { gap: gridGap, marginBottom: gridGap },
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={columns * 4}
        windowSize={5}
        maxToRenderPerBatch={columns * 4}
        removeClippedSubviews={!isTv}
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
    paddingBottom: spacing.md,
  },
  list: {
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  row: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'row-reverse',
    justifyContent: 'flex-start',
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
