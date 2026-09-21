import { Stack, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Glass } from '../components/Glass';
import { strings } from '../constants/strings';
import { colors, fonts, spacing } from '../constants/theme';
import { GlassScreen } from '../context/GlassContext';

const VideoPlayer = lazy(() => import('../components/VideoPlayer'));

const FALLBACK_VIDEO =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

export default function PlayerScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    uri?: string;
    title?: string;
  }>();
  const [playerFullscreen, setPlayerFullscreen] = useState(false);

  const title = params.title || params.q || strings.sampleVideo;
  const uri =
    typeof params.uri === 'string' && params.uri.length > 0
      ? params.uri
      : FALLBACK_VIDEO;

  return (
    <GlassScreen>
      <View
        style={[styles.container, playerFullscreen && styles.containerFullscreen]}
      >
        <Stack.Screen
          options={{
            title: strings.nowPlaying,
            headerShown: !playerFullscreen,
          }}
        />
        <View
          style={[
            styles.playerSlot,
            playerFullscreen && styles.playerSlotFullscreen,
          ]}
        >
          <Suspense
            fallback={
              <Glass style={styles.loading}>
                <ActivityIndicator color={colors.accent} />
              </Glass>
            }
          >
            <VideoPlayer
              key={uri}
              uri={uri}
              onFullscreenChange={setPlayerFullscreen}
            />
          </Suspense>
        </View>
        {playerFullscreen ? null : (
          <Glass style={styles.meta}>
            <Text style={styles.kicker}>{strings.nowPlaying}</Text>
            <Text style={styles.title}>{title}</Text>
            {params.q ? (
              <Text style={styles.subtitle}>
                {strings.searchPrefix}: {params.q}
              </Text>
            ) : null}
          </Glass>
        )}
      </View>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  containerFullscreen: {
    padding: 0,
    gap: 0,
  },
  playerSlot: {
    width: '100%',
  },
  playerSlotFullscreen: {
    flex: 1,
  },
  loading: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  meta: {
    gap: spacing.xs,
    borderRadius: 18,
    padding: spacing.md,
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.medium,
    textAlign: 'right',
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fonts.regular,
    textAlign: 'right',
  },
});
