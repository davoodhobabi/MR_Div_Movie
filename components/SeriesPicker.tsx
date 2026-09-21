import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EditionDivider } from './EditionDivider';
import { Glass } from './Glass';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { fetchFolderListing } from '../lib/catalog/fetchFolderListing';
import { EDITION_LABELS } from '../lib/catalog/editionLabels';
import { formatAvgSizeLabel, formatFileSizeLabel, formatQualityLabel } from '../lib/catalog/qualityLabel';
import type {
  CatalogEdition,
  FolderEpisode,
  SeriesQualityOption,
  SeriesSeason,
} from '../lib/catalog/types';
import { ltrProps, ltrStyle } from '../lib/rtl';
import { CATALOG_EDITIONS } from '../lib/catalog/types';

const EDITION_COLOR: Record<CatalogEdition, string> = {
  SoftSub: colors.softSub,
  Dubbed: colors.dubbed,
  NoSub: colors.noSub,
};

type SeriesPickerProps = {
  seasons: SeriesSeason[];
  activeEpisodeUrl: string | null;
  onPlayEpisode: (episode: FolderEpisode, option: SeriesQualityOption) => void;
  onDownloadEpisode: (
    episode: FolderEpisode,
    option: SeriesQualityOption,
  ) => void;
};

type Step = 'season' | 'quality' | 'episodes';

export function SeriesPicker({
  seasons,
  activeEpisodeUrl,
  onPlayEpisode,
  onDownloadEpisode,
}: SeriesPickerProps) {
  const [step, setStep] = useState<Step>('season');
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);
  const [quality, setQuality] = useState<SeriesQualityOption | null>(null);
  const [episodes, setEpisodes] = useState<FolderEpisode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const cacheRef = useRef<Map<string, FolderEpisode[]>>(new Map());

  const selectedSeason = useMemo(
    () => seasons.find((entry) => entry.season === seasonNumber) ?? null,
    [seasons, seasonNumber],
  );

  useEffect(() => {
    setStep('season');
    setSeasonNumber(null);
    setQuality(null);
    setEpisodes([]);
    setError(null);
    setLoading(false);
  }, [seasons]);

  useEffect(() => {
    if (step !== 'episodes' || !quality?.folderUrl) return;

    let cancelled = false;
    const folderUrl = quality.folderUrl;
    const cached = reloadToken === 0 ? cacheRef.current.get(folderUrl) : undefined;

    if (cached) {
      setEpisodes(cached);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setEpisodes([]);

    fetchFolderListing(folderUrl)
      .then((list) => {
        if (cancelled) return;
        cacheRef.current.set(folderUrl, list);
        setEpisodes(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = err instanceof Error ? err.message : 'UNKNOWN';
        setError(code);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, quality, reloadToken]);

  const selectSeason = (season: number) => {
    setSeasonNumber(season);
    setQuality(null);
    setEpisodes([]);
    setError(null);
    setReloadToken(0);
    setStep('quality');
  };

  const selectQuality = (option: SeriesQualityOption) => {
    setQuality(option);
    setEpisodes([]);
    setError(null);
    setReloadToken(0);
    setStep('episodes');
  };

  const retryEpisodes = () => {
    if (!quality) return;
    cacheRef.current.delete(quality.folderUrl);
    setReloadToken((value) => value + 1);
  };

  const goBack = () => {
    if (step === 'episodes') {
      setStep('quality');
      setQuality(null);
      setEpisodes([]);
      setError(null);
      return;
    }
    if (step === 'quality') {
      setStep('season');
      setSeasonNumber(null);
      setQuality(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View {...ltrProps} style={[styles.headerRow, ltrStyle]}>
        <Text style={styles.sectionTitle}>
          {step === 'season'
            ? strings.pickSeason
            : step === 'quality'
              ? strings.pickQuality
              : strings.pickEpisode}
        </Text>
        {step !== 'season' ? (
          <Pressable onPress={goBack} hitSlop={8}>
            <Glass {...ltrProps} style={[styles.backBtn, ltrStyle]}>
              <Ionicons name="arrow-undo" size={16} color={colors.textMuted} />
              <Text style={styles.backText}>{strings.backStep}</Text>
            </Glass>
          </Pressable>
        ) : null}
      </View>

      {step !== 'season' && seasonNumber != null ? (
        <Text style={styles.breadcrumb}>
          {strings.seasonLabel(seasonNumber)}
          {quality
            ? ` · ${EDITION_LABELS[quality.edition]} · ${formatQualityLabel(quality.quality)}`
            : ''}
        </Text>
      ) : null}

      {step === 'season' ? (
        <View {...ltrProps} style={[styles.chipRow, ltrStyle]}>
          {seasons.map((entry) => {
            const active = entry.season === seasonNumber;
            return (
              <Pressable
                key={entry.season}
                onPress={() => selectSeason(entry.season)}
              >
                <Glass style={[styles.seasonChip, active && styles.seasonChipActive]}>
                  <Text
                    style={[
                      styles.seasonChipText,
                      active && styles.seasonChipTextActive,
                    ]}
                  >
                    {strings.seasonLabel(entry.season)}
                  </Text>
                </Glass>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {step === 'quality' && selectedSeason ? (
        <View style={styles.list}>
          {CATALOG_EDITIONS.map((edition) => {
            const items = selectedSeason.options.filter(
              (option) => option.edition === edition,
            );
            if (items.length === 0) return null;
            return (
              <View key={edition} style={styles.editionGroup}>
                <EditionDivider edition={edition} />
                {items.map((option, index) => (
                  <Pressable
                    key={`${option.edition}-${option.quality}-${index}`}
                    onPress={() => selectQuality(option)}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Glass {...ltrProps} style={[styles.optionRow, ltrStyle]}>
                    <Ionicons
                      name="chevron-back"
                      size={18}
                      color={colors.textDim}
                    />
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionTitle}>
                        {formatQualityLabel(option.quality)}
                      </Text>
                      <Text style={styles.optionMeta}>
                        {[
                          option.episodeCount != null
                            ? strings.episodeCount(option.episodeCount)
                            : null,
                          option.avgSizeLabel
                            ? formatAvgSizeLabel(option.avgSizeLabel)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || strings.sizeUnknown}
                      </Text>
                    </View>
                    </Glass>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </View>
      ) : null}

      {step === 'episodes' ? (
        <View style={styles.list}>
          {loading ? (
            <Glass style={styles.stateBox}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.stateText}>{strings.loadingEpisodes}</Text>
            </Glass>
          ) : error ? (
            <Glass style={styles.stateBox}>
              <Text style={styles.errorText}>{strings.folderError(error)}</Text>
              {quality ? (
                <Pressable onPress={retryEpisodes}>
                  <Glass style={styles.retryBtn}>
                    <Text style={styles.retryText}>{strings.retryFetch}</Text>
                  </Glass>
                </Pressable>
              ) : null}
            </Glass>
          ) : (
            <View style={styles.episodeList}>
              <Text style={styles.episodeCountLabel}>
                {strings.episodeCount(episodes.length)}
              </Text>
              {episodes.map((episode) => {
                const active = activeEpisodeUrl === episode.url;
                const accent = quality
                  ? EDITION_COLOR[quality.edition]
                  : colors.accent;
                const ready = episode.url.trim().length > 0;
                return (
                    <Glass
                    key={episode.url}
                    {...ltrProps}
                    style={[
                      styles.optionRow,
                      ltrStyle,
                      {
                        borderColor: active ? accent : `${accent}55`,
                      },
                    ]}
                  >
                    <View style={styles.actions}>
                      <Pressable
                        onPress={
                          ready && quality
                            ? () => onPlayEpisode(episode, quality)
                            : undefined
                        }
                        disabled={!ready || !quality}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active, disabled: !ready }}
                        accessibilityLabel={`${strings.tapToPlay} · ${episode.name}`}
                        style={({ pressed }) => [
                          styles.iconWrap,
                          { backgroundColor: `${accent}22` },
                          pressed && ready && styles.iconPressed,
                        ]}
                      >
                        <Ionicons
                          name={active ? 'pause' : 'play'}
                          size={18}
                          color={accent}
                        />
                      </Pressable>
                      <Pressable
                        onPress={
                          ready && quality
                            ? () => onDownloadEpisode(episode, quality)
                            : undefined
                        }
                        disabled={!ready || !quality}
                        accessibilityRole="button"
                        accessibilityLabel={`${strings.downloadFile} · ${episode.name}`}
                        style={({ pressed }) => [
                          styles.iconWrap,
                          { backgroundColor: `${accent}22` },
                          pressed && ready && styles.iconPressed,
                        ]}
                      >
                        <Ionicons
                          name="download-outline"
                          size={18}
                          color={accent}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionTitle} numberOfLines={2}>
                        {episode.name}
                      </Text>
                      {episode.size ? (
                        <Text style={styles.optionMeta}>
                          {formatFileSizeLabel(episode.size)}
                        </Text>
                      ) : null}
                    </View>
                  </Glass>
                );
              })}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.bold,
    textAlign: 'right',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  backText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
  },
  breadcrumb: {
    color: colors.textDim,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'right',
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  seasonChip: {
    borderRadius: radii.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  seasonChipActive: {
    borderColor: colors.accent,
  },
  seasonChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  seasonChipTextActive: {
    color: colors.accent,
  },
  list: {
    gap: spacing.sm,
  },
  editionGroup: {
    gap: spacing.sm,
  },
  episodeList: {
    gap: spacing.sm,
  },
  episodeCountLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.regular,
    marginBottom: spacing.xs,
    textAlign: 'right',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.button,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  optionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: 0.85,
  },
  iconPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.backgroundSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCopy: {
    flex: 1,
    gap: 4,
    paddingVertical: 4,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.medium,
    textAlign: 'right',
    width: '100%',
  },
  optionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'right',
    width: '100%',
  },
  stateBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: radii.card,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  errorText: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: spacing.xs,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  retryText: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
});
