import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFloatingTabBarPadding } from '../../lib/tabBarInset';
import { BrandLogo } from '../../components/BrandLogo';
import { Glass } from '../../components/Glass';
import { HomeCarousel } from '../../components/HomeCarousel';
import { HomeTitleCard } from '../../components/HomeTitleCard';
import { SupportReminderModal } from '../../components/SupportReminderModal';
import { strings } from '../../constants/strings';
import { colors, fonts, radii, spacing } from '../../constants/theme';
import { useCatalog } from '../../context/CatalogContext';
import { GlassScreen } from '../../context/GlassContext';
import { useLayout } from '../../lib/layout';
import {
  markSupportReminderSeen,
  shouldShowSupportReminder,
} from '../../lib/supportReminder';
import { compareByImdbRating } from '../../lib/catalog/rating';
import type { ContinueWatchingEntry } from '../../lib/catalog/continueWatching';
import type { IndexedCatalogItem } from '../../lib/catalog/types';
import { useIsTv } from '../../lib/tv';

const FAVORITE_CAROUSEL_LIMIT = 5;

type WatchingRow = {
  item: IndexedCatalogItem;
  entry: ContinueWatchingEntry;
};

export default function HomeScreen() {
  const {
    count,
    movies,
    series,
    favorites,
    continueWatching,
    dismissContinueWatching,
    isFavorite,
    toggleFavorite,
  } = useCatalog();
  const [supportOpen, setSupportOpen] = useState(false);
  const homeFocused = useIsFocused();
  const tabBarPad = useFloatingTabBarPadding();
  const { isTablet, isDesktop, gutter, posterWidth } = useLayout();
  const isTv = useIsTv();
  const favoriteLimit = isTv
    ? 6
    : isDesktop
      ? 12
      : isTablet
        ? 8
        : FAVORITE_CAROUSEL_LIMIT;
  const shelfLimit = isTv ? 8 : isDesktop ? 20 : isTablet ? 16 : 12;
  const favoriteCards = favorites.slice(0, favoriteLimit);
  const watchingCards = continueWatching.slice(0, isTv ? 6 : isDesktop ? 12 : 8);
  const movies2026 = useMemo(
    () =>
      movies
        .filter((item) => item.year === 2026)
        .sort(compareByImdbRating)
        .slice(0, shelfLimit),
    [movies, shelfLimit],
  );
  const topMovies = useMemo(
    () => [...movies].sort(compareByImdbRating).slice(0, shelfLimit),
    [movies, shelfLimit],
  );
  const topSeries = useMemo(
    () => [...series].sort(compareByImdbRating).slice(0, shelfLimit),
    [series, shelfLimit],
  );
  const tagline = strings.catalogReady(count.toLocaleString('fa-IR'));

  useEffect(() => {
    if (!homeFocused) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void shouldShowSupportReminder().then((show) => {
        if (!cancelled && show) setSupportOpen(true);
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [homeFocused]);

  const dismissSupport = () => {
    setSupportOpen(false);
    void markSupportReminderSeen();
  };

  const openTitle = useCallback((item: IndexedCatalogItem) => {
    router.push({
      pathname: '/title/[id]',
      params: { id: item.imdbId },
    });
  }, []);

  const catalogKey = useCallback(
    (item: IndexedCatalogItem) => `${item.imdbId}-${item.index}`,
    [],
  );

  const renderCatalogCard = useCallback(
    ({ item, active }: { item: IndexedCatalogItem; active: boolean }) => (
      <HomeTitleCard
        item={item}
        width={posterWidth}
        active={active}
        favorited={isFavorite(item.imdbId)}
        onToggleFavorite={() => toggleFavorite(item.imdbId)}
        onPress={() => openTitle(item)}
      />
    ),
    [isFavorite, openTitle, posterWidth, toggleFavorite],
  );

  const renderFavoriteCard = useCallback(
    ({ item, active }: { item: IndexedCatalogItem; active: boolean }) => (
      <HomeTitleCard
        item={item}
        width={posterWidth}
        active={active}
        variant="favorite"
        favorited
        onPress={() => openTitle(item)}
      />
    ),
    [openTitle, posterWidth],
  );

  const watchingKey = useCallback(
    (row: WatchingRow) => `${row.item.imdbId}-${row.entry.updatedAt}`,
    [],
  );

  const renderWatchingCard = useCallback(
    ({ item: row, active }: { item: WatchingRow; active: boolean }) => {
      const { item, entry } = row;
      const ratio = entry.duration > 0 ? entry.position / entry.duration : 0;
      const percent = Math.round(ratio * 100).toLocaleString('fa-IR');
      return (
        <HomeTitleCard
          item={item}
          width={posterWidth}
          active={active}
          variant="watching"
          progress={ratio}
          subtitle={
            entry.duration > 0
              ? strings.continuePercent(percent)
              : entry.sourceTitle
          }
          onRemoveWatching={() => dismissContinueWatching(item.imdbId)}
          onPress={() =>
            router.push({
              pathname: '/title/[id]',
              params: {
                id: item.imdbId,
                resumeUri: entry.uri,
                resumeKey: entry.key,
                resumeAt: String(Math.floor(entry.position)),
                resumeTitle: entry.sourceTitle,
                resumeEdition: entry.edition,
                resumeReferer: entry.referer ?? '',
              },
            })
          }
        />
      );
    },
    [dismissContinueWatching, posterWidth],
  );

  return (
    <GlassScreen captureTabBarBlur>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={isTv}
          contentContainerStyle={[styles.content, { paddingBottom: tabBarPad }]}
        >
          <View style={[styles.topBar, isTablet && styles.topBarWide, { paddingHorizontal: gutter }]}>
            <View style={[styles.brand, isTablet && styles.brandWide]}>
              <BrandLogo size="sm" />
              <Text style={styles.headline}>{strings.homeHeadline}</Text>
            </View>
            <Glass style={styles.statusPill}>
              <Ionicons name="sparkles" size={14} color={colors.gold} />
              <Text style={styles.tagline}>{tagline}</Text>
            </Glass>
          </View>

          {favoriteCards.length > 0 ? (
            <HomeCarousel
              title={strings.favoritesTitle}
              icon="heart"
              onSeeAll={() => router.push('/favorites')}
              data={favoriteCards}
              keyExtractor={catalogKey}
              renderItem={renderFavoriteCard}
              itemWidth={posterWidth}
            />
          ) : null}

          {watchingCards.length > 0 ? (
            <HomeCarousel
              title={strings.nowPlayingSection}
              icon="play-circle"
              iconColor={colors.gold}
              data={watchingCards as WatchingRow[]}
              keyExtractor={watchingKey}
              renderItem={renderWatchingCard}
              itemWidth={posterWidth}
            />
          ) : null}

          {movies2026.length > 0 ? (
            <HomeCarousel
              title={strings.movies2026Section}
              icon="film"
              iconColor={colors.gold}
              data={movies2026}
              keyExtractor={catalogKey}
              renderItem={renderCatalogCard}
              itemWidth={posterWidth}
            />
          ) : null}

          <HomeCarousel
            title={strings.topMoviesSection}
            icon="star"
            iconColor={colors.gold}
            data={topMovies}
            keyExtractor={catalogKey}
            renderItem={renderCatalogCard}
            itemWidth={posterWidth}
          />

          <HomeCarousel
            title={strings.topSeriesSection}
            icon="trophy"
            iconColor={colors.gold}
            data={topSeries}
            keyExtractor={catalogKey}
            renderItem={renderCatalogCard}
            itemWidth={posterWidth}
          />
        </ScrollView>
      </SafeAreaView>
      <SupportReminderModal visible={supportOpen} onDismiss={dismissSupport} />
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    gap: spacing.xl,
  },
  topBar: {
    paddingTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  topBarWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headline: {
    fontSize: 22,
    color: colors.text,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tagline: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
});
