import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
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
import {
  markSupportReminderSeen,
  shouldShowSupportReminder,
} from '../../lib/supportReminder';
import type { IndexedCatalogItem } from '../../lib/catalog/types';

const FAVORITE_CAROUSEL_LIMIT = 5;

export default function HomeScreen() {
  const { count, favorites, continueWatching, dismissContinueWatching } =
    useCatalog();
  const [supportOpen, setSupportOpen] = useState(false);
  const homeFocused = useIsFocused();
  const tabBarPad = useFloatingTabBarPadding();
  const favoriteCards = favorites.slice(0, FAVORITE_CAROUSEL_LIMIT);
  const watchingCards = continueWatching.slice(0, 8);
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

  const openTitle = (item: IndexedCatalogItem) => {
    router.push({
      pathname: '/title/[id]',
      params: { id: item.imdbId },
    });
  };

  return (
    <GlassScreen captureTabBarBlur>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: tabBarPad }]}
        >
          <View style={styles.topBar}>
            <BrandLogo size="sm" />
            <Text style={styles.headline}>{strings.homeHeadline}</Text>
            <Glass style={styles.statusPill}>
              <Ionicons name="sparkles" size={14} color={colors.gold} />
              <Text style={styles.tagline}>{tagline}</Text>
            </Glass>
          </View>

          <HomeCarousel
            title={strings.favoritesTitle}
            icon="heart"
            onSeeAll={() => router.push('/favorites')}
            empty={favoriteCards.length === 0}
            emptyTitle={strings.favoritesCarouselEmpty}
            emptyHint={strings.favoritesCarouselHint}
          >
            {favoriteCards.map((item) => (
              <HomeTitleCard
                key={`${item.imdbId}-${item.index}`}
                item={item}
                variant="favorite"
                favorited
                onPress={() => openTitle(item)}
              />
            ))}
          </HomeCarousel>

          <HomeCarousel
            title={strings.nowPlayingSection}
            icon="play-circle"
            iconColor={colors.gold}
            empty={watchingCards.length === 0}
            emptyTitle={strings.nowPlayingEmpty}
            emptyHint={strings.nowPlayingEmptyHint}
          >
            {watchingCards.map(({ item, entry }) => {
              const ratio =
                entry.duration > 0 ? entry.position / entry.duration : 0;
              const percent = Math.round(ratio * 100).toLocaleString('fa-IR');
              return (
                <HomeTitleCard
                  key={`${item.imdbId}-${entry.updatedAt}`}
                  item={item}
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
            })}
          </HomeCarousel>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
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
