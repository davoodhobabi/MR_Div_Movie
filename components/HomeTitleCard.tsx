import { BlurTargetView, BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii } from '../constants/theme';
import { usePosterUrl } from '../lib/catalog/poster';
import { isSeriesItem, type CatalogItem } from '../lib/catalog/types';

const POSTER_WIDTH = 140;
const POSTER_ASPECT = 3 / 2;
const POSTER_RADIUS = 12;

type HomeTitleCardProps = {
  item: CatalogItem;
  onPress: () => void;
  progress?: number;
  subtitle?: string;
  variant?: 'favorite' | 'watching';
  width?: number;
  favorited?: boolean;
  onToggleFavorite?: () => void;
  onRemoveWatching?: () => void;
};

export function HomeTitleCard({
  item,
  onPress,
  progress,
  subtitle,
  variant = 'favorite',
  width = POSTER_WIDTH,
  favorited = false,
  onToggleFavorite,
  onRemoveWatching,
}: HomeTitleCardProps) {
  const posterUrl = usePosterUrl(item);
  const posterTargetRef = useRef<View | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const showPoster = Boolean(posterUrl) && !posterFailed;
  const frameWidth = PixelRatio.roundToNearestPixel(width);
  const frameHeight = PixelRatio.roundToNearestPixel(frameWidth * POSTER_ASPECT);
  const persian = item.titleFa?.trim();
  const kind = isSeriesItem(item) ? strings.series : strings.movie;
  const year =
    item.year != null
      ? item.year.toLocaleString('fa-IR', { useGrouping: false })
      : null;
  const rating =
    item.imdbRating != null
      ? item.imdbRating.toLocaleString('fa-IR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
      : null;
  const watching = variant === 'watching';
  const percent =
    typeof progress === 'number'
      ? Math.round(Math.max(0, Math.min(1, progress)) * 100)
      : null;

  useEffect(() => {
    setPosterFailed(false);
  }, [item.imdbId, posterUrl]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View
        collapsable={false}
        style={[styles.frame, { width: frameWidth, height: frameHeight }]}
      >
        <BlurTargetView ref={posterTargetRef} collapsable={false} style={styles.fill}>
          {showPoster ? (
            <>
              <Image
                source={{ uri: posterUrl as string }}
                style={styles.fill}
                resizeMode="cover"
                blurRadius={18}
                fadeDuration={0}
              />
              <Image
                source={{ uri: posterUrl as string }}
                style={styles.fill}
                resizeMode="contain"
                fadeDuration={0}
                onError={() => setPosterFailed(true)}
              />
            </>
          ) : (
            <View style={[styles.fill, styles.placeholder]}>
              <Ionicons
                name={isSeriesItem(item) ? 'tv-outline' : 'film-outline'}
                size={28}
                color={colors.textDim}
              />
            </View>
          )}
        </BlurTargetView>

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.badges} pointerEvents="box-none">
            {watching ? (
              <Pressable
                onPress={onRemoveWatching}
                hitSlop={10}
                disabled={!onRemoveWatching}
                style={[styles.mark, styles.markWatch]}
                accessibilityRole="button"
                accessibilityLabel={strings.removeFromNowPlayingA11y}
              >
                <Ionicons name="close" size={14} color={colors.gold} />
              </Pressable>
            ) : (
              <Pressable
                onPress={onToggleFavorite}
                hitSlop={10}
                disabled={!onToggleFavorite}
                style={[styles.mark, styles.markFav]}
                accessibilityRole={onToggleFavorite ? 'button' : undefined}
              >
                <Ionicons
                  name={favorited ? 'heart' : 'heart-outline'}
                  size={12}
                  color={colors.accent}
                />
              </Pressable>
            )}
            <BlurView
              blurTarget={posterTargetRef}
              intensity={40}
              tint="dark"
              blurMethod="dimezisBlurView"
              style={styles.kindChip}
            >
              <Text style={styles.kindText}>{kind}</Text>
            </BlurView>
          </View>

          <View style={styles.copyWrap}>
            <BlurView
              blurTarget={posterTargetRef}
              intensity={50}
              tint="dark"
              blurMethod="dimezisBlurView"
              style={styles.copyBlur}
            >
              <View style={styles.copyInner}>
                {persian ? (
                  <Text style={styles.titleFa} numberOfLines={2}>
                    {persian}
                  </Text>
                ) : null}
                <Text
                  style={[styles.titleEn, !persian && styles.titleEnSolo]}
                  numberOfLines={persian ? 1 : 2}
                >
                  {item.title}
                </Text>
                <View style={styles.meta}>
                  {rating ? (
                    <View style={styles.rating}>
                      <Ionicons name="star" size={11} color={colors.gold} />
                      <Text style={styles.ratingText}>{rating}</Text>
                    </View>
                  ) : null}
                  {year ? <Text style={styles.metaText}>{year}</Text> : null}
                </View>
                {watching && subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
                {watching ? (
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(6, Math.min(100, percent ?? 0))}%`,
                        },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            </BlurView>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },
  frame: {
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSoft,
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSoft,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markFav: {
    backgroundColor: colors.accentSoft,
  },
  markWatch: {
    backgroundColor: colors.goldSoft,
  },
  kindChip: {
    overflow: 'hidden',
    borderRadius: radii.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindText: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  copyWrap: {
    alignSelf: 'stretch',
    width: '100%',
    overflow: 'hidden',
    borderTopLeftRadius: POSTER_RADIUS,
    borderTopRightRadius: POSTER_RADIUS,
  },
  copyBlur: {
    overflow: 'hidden',
    width: '100%',
  },
  copyInner: {
    width: '100%',
    direction: 'ltr',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 3,
  },
  titleFa: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.bold,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    lineHeight: 20,
  },
  titleEn: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.regular,
    textAlign: 'right',
    width: '100%',
  },
  titleEnSolo: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.bold,
    textAlign: 'right',
    width: '100%',
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    direction: 'ltr',
    gap: 8,
    marginTop: 2,
  },
  metaText: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.regular,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    color: colors.gold,
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  subtitle: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.medium,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  progressTrack: {
    height: 3,
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
});
