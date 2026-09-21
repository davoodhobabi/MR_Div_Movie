import { useEventListener } from 'expo';
import {
  useVideoPlayer,
  VideoView,
  type SubtitleTrack,
} from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { encodeMediaUrl } from '../lib/catalog/videoSource';
import { pickPreferredSubtitle } from '../lib/player/subtitlePicker';
import {
  disposeWebVideoSubtitles,
  loadWebVideoSubtitles,
} from '../lib/player/webSubtitleTracks';

type VideoPlayerProps = {
  uri: string;
  initialTime?: number;
  onFullscreenChange?: (fullscreen: boolean) => void;
  onProgress?: (progress: { currentTime: number; duration: number }) => void;
};

function isCodecError(message: string) {
  return /mediacodec|videorenderer|x-matroska|decoder|hevc|h\.?265|format is not supported|-11828|cannot open/i.test(
    message,
  );
}

export function VideoPlayer({
  uri,
  initialTime = 0,
  onFullscreenChange,
  onProgress,
}: VideoPlayerProps) {
  const source = useMemo(() => encodeMediaUrl(uri), [uri]);
  const selectedRef = useRef(false);
  const didSeekRef = useRef(false);
  const viewRef = useRef<VideoView>(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.play();
  });
  const lastProgressRef = useRef({ currentTime: 0, duration: 0 });

  useEffect(() => {
    setFullscreen(false);
    onFullscreenChange?.(false);
    didSeekRef.current = false;
    lastProgressRef.current = { currentTime: 0, duration: 0 };
  }, [uri, onFullscreenChange]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const controller = new AbortController();
    void loadWebVideoSubtitles(player, source, controller.signal).catch(
      () => {
        // HTML5 cannot read MKV SoftSub without this path; keep playback going.
      },
    );
    return () => {
      controller.abort();
      disposeWebVideoSubtitles(player);
    };
  }, [player, source]);

  useEffect(() => {
    let alive = true;
    const timer = setInterval(() => {
      if (!alive) return;
      try {
        const currentTime = player.currentTime;
        const duration = player.duration;
        if (!Number.isFinite(currentTime)) return;
        lastProgressRef.current = {
          currentTime,
          duration: Number.isFinite(duration) ? duration : 0,
        };
        onProgressRef.current?.(lastProgressRef.current);
      } catch {
        // Player may already be released while leaving the screen.
      }
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
      const last = lastProgressRef.current;
      if (last.currentTime > 0) {
        onProgressRef.current?.(last);
      }
    };
  }, [player]);

  useEffect(() => {
    if (!fullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void viewRef.current?.exitFullscreen();
      return true;
    });
    return () => sub.remove();
  }, [fullscreen]);

  const selectPreferredSubtitle = (tracks?: SubtitleTrack[]) => {
    if (selectedRef.current) return;
    const list =
      tracks && tracks.length > 0 ? tracks : player.availableSubtitleTracks;
    const track = pickPreferredSubtitle(list);
    if (!track) return;
    player.subtitleTrack = track;
    selectedRef.current = true;
  };

  useEventListener(
    player,
    'sourceLoad',
    ({ availableSubtitleTracks }: { availableSubtitleTracks: SubtitleTrack[] }) => {
      selectedRef.current = false;
      selectPreferredSubtitle(availableSubtitleTracks);
    },
  );

  useEventListener(
    player,
    'availableSubtitleTracksChange',
    ({
      availableSubtitleTracks,
    }: {
      availableSubtitleTracks: SubtitleTrack[];
    }) => {
      selectPreferredSubtitle(availableSubtitleTracks);
    },
  );

  useEventListener(player, 'statusChange', ({ status, error: playerError }) => {
    if (status === 'loading') {
      setLoading(true);
      setError(null);
      selectedRef.current = false;
      return;
    }
    if (status === 'readyToPlay') {
      setLoading(false);
      setError(null);
      selectPreferredSubtitle();
      if (!didSeekRef.current && initialTime > 1) {
        try {
          player.currentTime = initialTime;
        } catch {
          // Ignore seek failures; playback can still start from the beginning.
        }
        didSeekRef.current = true;
      }
      return;
    }
    if (status === 'error') {
      setLoading(false);
      const message = playerError?.message || strings.playbackFailed;
      setError(
        isCodecError(message) ? strings.playbackCodecUnsupported : message,
      );
    }
  });

  return (
    <View style={fullscreen ? styles.wrapperFullscreen : styles.wrapper}>
      {fullscreen ? <StatusBar hidden /> : null}
      <VideoView
        ref={viewRef}
        style={styles.video}
        player={player}
        nativeControls
        fullscreenOptions={{ enable: true, orientation: 'landscape' }}
        allowsPictureInPicture={false}
        contentFit="contain"
        surfaceType="textureView"
        useExoShutter
        onFullscreenEnter={() => {
          setFullscreen(true);
          onFullscreenChange?.(true);
        }}
        onFullscreenExit={() => {
          setFullscreen(false);
          onFullscreenChange?.(false);
        }}
      />
      {loading && !error ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.overlayText}>{strings.playbackLoading}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => {
              setError(null);
              setLoading(true);
              player.play();
            }}
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={strings.retryFetch}
          >
            <Text style={styles.retryBtnText}>{strings.retryFetch}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.backgroundSoft,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  wrapperFullscreen: {
    width: '100%',
    flex: 1,
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(7, 8, 12, 0.82)',
  },
  overlayText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  errorText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.medium,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.button,
  },
  retryBtnText: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.75,
  },
});

export default VideoPlayer;
