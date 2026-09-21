import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EditionDivider } from '../../components/EditionDivider';
import { Glass } from '../../components/Glass';
import { SeriesPicker } from '../../components/SeriesPicker';
import { SourceButton } from '../../components/SourceButton';
import { strings } from '../../constants/strings';
import { colors, fonts, radii, spacing } from '../../constants/theme';
import { useCatalog } from '../../context/CatalogContext';
import { GlassScreen } from '../../context/GlassContext';
import { useLayout } from '../../lib/layout';
import { ltrProps, ltrStyle } from '../../lib/rtl';
import { encodeMediaUrl } from '../../lib/catalog/videoSource';
import { formatQualityLabel } from '../../lib/catalog/qualityLabel';
import {
  CATALOG_EDITIONS,
  type CatalogEdition,
  type CatalogSource,
  type FolderEpisode,
  type SeriesQualityOption,
} from '../../lib/catalog/types';

// Lazy so a player/native import failure cannot take down the title route itself.
const VideoPlayer = lazy(() => import('../../components/VideoPlayer'));

function groupSources(sources: CatalogSource[]) {
  return CATALOG_EDITIONS.map((edition) => ({
    edition,
    items: sources.filter((source) => source.edition === edition),
  })).filter((group) => group.items.length > 0);
}

function sourceKey(source: CatalogSource, index: number) {
  return `${source.edition}:${source.title}:${source.url}:${index}`;
}

function paramString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function WebTitleBackButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={strings.backStep}
      style={styles.webBackBtn}
    >
      <Ionicons name="chevron-forward" size={28} color={colors.text} />
    </Pressable>
  );
}

type ActivePlayback = {
  uri: string;
  referer?: string;
  title: string;
  edition: CatalogEdition;
  key: string;
  resumeAt?: number;
};

export default function TitleScreen() {
  const params = useLocalSearchParams<{
    id: string;
    resumeUri?: string;
    resumeKey?: string;
    resumeAt?: string;
    resumeTitle?: string;
    resumeEdition?: string;
    resumeReferer?: string;
  }>();
  const id = paramString(params.id);
  const { findById, isFavorite, toggleFavorite, recordProgress } = useCatalog();
  const item = id ? findById(id) : undefined;
  const favorited = item ? isFavorite(item.imdbId) : false;
  const [playback, setPlayback] = useState<ActivePlayback | null>(null);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const resumeStarted = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const { width: windowWidth, isTablet, gutter } = useLayout();
  // Leave room for the back button without crushing the two-line title.
  const navTitleWidth = Math.max(160, windowWidth - 120);

  const seasons = item?.seasons ?? [];
  const isSeries = item?.type === 'series' && seasons.length > 0;
  const groups = useMemo(
    () => (item && !isSeries ? groupSources(item.urls) : []),
    [item, isSeries],
  );

  useEffect(() => {
    setPlayback(null);
    setPlayerFullscreen(false);
    resumeStarted.current = false;
  }, [id]);

  const startPlayback = (next: ActivePlayback) => {
    setPlayerFullscreen(false);
    setPlayback(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  useEffect(() => {
    if (!item || resumeStarted.current) return;
    const resumeUri = paramString(params.resumeUri);
    if (!resumeUri) return;
    resumeStarted.current = true;
    const edition = paramString(params.resumeEdition);
    const resumeAt = Number(paramString(params.resumeAt));
    startPlayback({
      uri: resumeUri,
      referer: paramString(params.resumeReferer),
      title: paramString(params.resumeTitle) || resumeUri,
      edition:
        edition === 'Dubbed' || edition === 'NoSub' || edition === 'SoftSub'
          ? edition
          : 'SoftSub',
      key: paramString(params.resumeKey) || resumeUri,
      resumeAt: Number.isFinite(resumeAt) && resumeAt > 1 ? resumeAt : undefined,
    });
  }, [
    item,
    params.resumeUri,
    params.resumeKey,
    params.resumeTitle,
    params.resumeEdition,
    params.resumeReferer,
    params.resumeAt,
  ]);

  if (!item) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: strings.titleFallback }} />
        <Text style={styles.muted}>{strings.titleNotFound}</Text>
      </View>
    );
  }

  const imdbUrl = `https://www.imdb.com/title/${item.imdbId}/`;
  const kind = isSeries ? strings.series : strings.movie;
  const votes =
    item.imdbVotes != null ? item.imdbVotes.toLocaleString('fa-IR') : '—';
  const rating =
    item.imdbRating != null
      ? item.imdbRating.toLocaleString('fa-IR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
      : '—';
  const yearLabel =
    item.year != null ? item.year.toLocaleString('fa-IR', { useGrouping: false }) : null;
  const persian = item.titleFa?.trim();

  const onSourcePress = (source: CatalogSource, key: string) => {
    if (!source.url.trim()) {
      Alert.alert(formatQualityLabel(source.title), strings.sourceUnavailable);
      return;
    }
    startPlayback({
      uri: source.url,
      title: formatQualityLabel(source.title),
      edition: source.edition,
      key,
    });
  };

  const onSourceDownload = (source: CatalogSource) => {
    if (!source.url.trim()) {
      Alert.alert(formatQualityLabel(source.title), strings.sourceUnavailable);
      return;
    }
    void Linking.openURL(encodeMediaUrl(source.url));
  };

  const onPlayEpisode = (
    episode: FolderEpisode,
    option: SeriesQualityOption,
  ) => {
    startPlayback({
      uri: episode.url,
      referer: option.folderUrl,
      title: episode.name,
      edition: option.edition,
      key: episode.url,
    });
  };

  const onDownloadEpisode = (episode: FolderEpisode) => {
    if (!episode.url.trim()) {
      Alert.alert(episode.name, strings.sourceUnavailable);
      return;
    }
    void Linking.openURL(encodeMediaUrl(episode.url));
  };

  return (
    <GlassScreen>
      {/* Keep player outside ScrollView — heavy episode lists remount/detach VideoView and force-pause. */}
      <Stack.Screen
        options={{
          headerShown: !playerFullscreen,
          headerBackVisible: Platform.OS !== 'web',
          headerTitleAlign: 'center',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerLeft: Platform.OS === 'web' ? () => <WebTitleBackButton /> : undefined,
          headerLeftContainerStyle:
            Platform.OS === 'web'
              ? styles.webBackWrap
              : undefined,
          headerTitleContainerStyle:
            Platform.OS === 'web'
              ? styles.webTitleWrap
              : {
                  width: navTitleWidth,
                  maxWidth: navTitleWidth,
                  paddingVertical: 8,
                  alignItems: 'center',
                },
          headerTitle: () => (
            <View
              style={[
                styles.navTitleWrap,
                Platform.OS === 'web' ? styles.webNavTitle : { width: navTitleWidth },
              ]}
            >
              {persian ? (
                <Text style={styles.navTitleFa} numberOfLines={1}>
                  {persian}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.navTitleEn,
                  !persian && styles.navTitleEnSolo,
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </View>
          ),
        }}
      />

      <View style={[styles.split, isTablet && styles.splitWide]}>
      <View
        style={[
          styles.playerDock,
          { paddingHorizontal: playerFullscreen ? 0 : gutter },
          isTablet && styles.playerDockWide,
          playerFullscreen && styles.playerDockFullscreen,
        ]}
      >
        {playback ? (
          <>
            <Suspense
              fallback={
                <View style={styles.playerPlaceholder}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.placeholderTitle}>
                    {strings.playbackLoading}
                  </Text>
                </View>
              }
            >
              <VideoPlayer
                key={playback.key}
                uri={playback.uri}
                initialTime={playback.resumeAt ?? 0}
                onFullscreenChange={setPlayerFullscreen}
                onProgress={({ currentTime, duration }) => {
                  recordProgress({
                    imdbId: item.imdbId,
                    uri: playback.uri,
                    key: playback.key,
                    sourceTitle: playback.title,
                    edition: playback.edition,
                    referer: playback.referer,
                    position: currentTime,
                    duration,
                  });
                }}
              />
            </Suspense>
            {playerFullscreen ? null : (
              <Glass {...ltrProps} style={[styles.nowPlaying, ltrStyle]}>
                <View style={styles.liveDot} />
                <Text style={styles.nowPlayingLabel}>
                  {strings.nowPlayingLabel}
                </Text>
                <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                  {playback.title}
                </Text>
              </Glass>
            )}
          </>
        ) : (
          <Glass style={styles.playerPlaceholder}>
            <View style={styles.placeholderIcon}>
              <Ionicons name="play" size={28} color={colors.accent} />
            </View>
            <Text style={styles.placeholderTitle}>
              {isSeries ? strings.tapToPlaySeries : strings.tapToPlay}
            </Text>
          </Glass>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View {...ltrProps} style={[styles.chips, ltrStyle]}>
            <Pressable
              onPress={() => toggleFavorite(item.imdbId)}
              style={({ pressed }) => [pressed && styles.linkPressed]}
              accessibilityRole="button"
              accessibilityLabel={
                favorited ? strings.unfavoriteA11y : strings.favoriteA11y
              }
            >
              <Glass
                style={[
                  styles.chip,
                  styles.favoriteChip,
                  favorited && styles.favoriteChipOn,
                ]}
              >
                <Ionicons
                  name={favorited ? 'heart' : 'heart-outline'}
                  size={13}
                  color={favorited ? colors.accent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.favoriteChipText,
                    favorited && styles.favoriteChipTextOn,
                  ]}
                >
                  {strings.favorited}
                </Text>
              </Glass>
            </Pressable>
            <Glass style={styles.chip}>
              <Text style={styles.chipText}>{kind}</Text>
            </Glass>
            {item.year != null ? (
              <Glass style={styles.chip}>
                <Text style={styles.chipText}>{yearLabel}</Text>
              </Glass>
            ) : null}
            <Glass style={[styles.chip, styles.ratingChip]}>
              <Ionicons name="star" size={13} color={colors.gold} />
              <Text style={styles.ratingChipText}>{rating}</Text>
            </Glass>
            <Pressable
              onPress={() => Linking.openURL(imdbUrl)}
              style={({ pressed }) => [pressed && styles.linkPressed]}
              accessibilityRole="link"
              accessibilityLabel={strings.openImdb}
            >
              <Glass style={[styles.chip, styles.imdbChip]}>
                <Ionicons name="open-outline" size={13} color={colors.accent} />
                <Text style={styles.imdbChipText}>{strings.openImdb}</Text>
              </Glass>
            </Pressable>
          </View>
        </View>

        <Glass {...ltrProps} style={[styles.stats, ltrStyle]}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{strings.imdb}</Text>
            <Text style={styles.statValue}>{item.imdbId}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{strings.rating}</Text>
            <Text style={styles.statValue}>{rating}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{strings.votes}</Text>
            <Text style={styles.statValue}>{votes}</Text>
          </View>
        </Glass>

        {isSeries ? (
          seasons.length === 0 ? (
            <Glass style={styles.emptySources}>
              <Text style={styles.muted}>{strings.noSources}</Text>
            </Glass>
          ) : (
            <SeriesPicker
              seasons={seasons}
              activeEpisodeUrl={playback?.uri ?? null}
              onPlayEpisode={onPlayEpisode}
              onDownloadEpisode={onDownloadEpisode}
            />
          )
        ) : groups.length === 0 ? (
          <Glass style={styles.emptySources}>
            <Text style={styles.muted}>{strings.noSources}</Text>
          </Glass>
        ) : (
          groups.map((group) => (
            <View key={group.edition} style={styles.group}>
              <EditionDivider edition={group.edition as CatalogEdition} />
              {group.items.map((source, index) => {
                const key = sourceKey(source, index);
                return (
                  <SourceButton
                    key={key}
                    source={source}
                    active={playback?.key === key}
                    onPlay={() => onSourcePress(source, key)}
                    onDownload={() => onSourceDownload(source)}
                  />
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
      </View>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  split: {
    flex: 1,
  },
  splitWide: {
    flexDirection: 'row',
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.lg,
    paddingBottom: 96,
    gap: spacing.md,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  playerSection: {
    gap: spacing.sm,
  },
  playerDock: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  playerDockWide: {
    flex: 1.2,
    maxWidth: 820,
  },
  playerDockFullscreen: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    elevation: 50,
    padding: 0,
    backgroundColor: '#000',
  },
  playerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  placeholderIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
  nowPlaying: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  nowPlayingLabel: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  nowPlayingTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  hero: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  navTitleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: 4,
    paddingBottom: 2,
    paddingHorizontal: 4,
  },
  webBackWrap: {
    zIndex: 4,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webBackBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webTitleWrap: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '72%',
    paddingVertical: 8,
    alignItems: 'center',
  },
  webNavTitle: {
    width: '100%',
    maxWidth: 520,
  },
  navTitleFa: {
    color: colors.text,
    fontSize: 20,
    fontFamily: fonts.bold,
    textAlign: 'center',
    width: '100%',
  },
  navTitleEn: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: 'center',
    width: '100%',
  },
  navTitleEnSolo: {
    color: colors.text,
    fontSize: 20,
    fontFamily: fonts.bold,
  },
  chips: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
    width: '100%',
  },
  chip: {
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  ratingChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  ratingChipText: {
    color: colors.gold,
    fontSize: 12,
    fontFamily: fonts.bold,
    writingDirection: 'ltr',
  },
  favoriteChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  favoriteChipOn: {
    borderColor: `${colors.accent}88`,
  },
  favoriteChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  favoriteChipTextOn: {
    color: colors.accent,
  },
  imdbChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  imdbChipText: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  linkPressed: {
    opacity: 0.85,
  },
  stats: {
    flexDirection: 'row-reverse',
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontFamily: fonts.regular,
  },
  statValue: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.medium,
    writingDirection: 'ltr',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: 4,
  },
  group: {
    gap: spacing.sm,
  },
  emptySources: {
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 15,
    fontFamily: fonts.regular,
    textAlign: 'right',
  },
});
