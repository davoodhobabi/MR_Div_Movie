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
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import {
  encodeMediaUrl,
  isHtml5UnsupportedMediaUrl,
} from '../lib/catalog/videoSource';
import { webMediaHlsUrl } from '../lib/catalog/webProxy';
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

function isIosWeb() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const touchMac =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(ua) || touchMac;
}

function isCodecError(message: string) {
  return /mediacodec|videorenderer|x-matroska|matroska|decoder|hevc|h\.?265|format is not supported|no supported sources|demuxer|-11828|cannot open|empty src|ffmpeg/i.test(
    message,
  );
}

export function VideoPlayer({
  uri,
  initialTime = 0,
  onFullscreenChange,
  onProgress,
}: VideoPlayerProps) {
  const originalUrl = useMemo(() => encodeMediaUrl(uri), [uri]);
  const iosMkv = isIosWeb() && isHtml5UnsupportedMediaUrl(uri);
  const sourceUrl = iosMkv ? webMediaHlsUrl(originalUrl) : originalUrl;
  const selectedRef = useRef(false);
  const didSeekRef = useRef(false);
  const startedRef = useRef(false);
  const viewRef = useRef<VideoView>(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const player = useVideoPlayer(sourceUrl, (instance) => {
    instance.loop = false;
    instance.play();
  });
  const lastProgressRef = useRef({ currentTime: 0, duration: 0 });

  useEffect(() => {
    setFullscreen(false);
    onFullscreenChange?.(false);
    didSeekRef.current = false;
    lastProgressRef.current = { currentTime: 0, duration: 0 };
    startedRef.current = false;
    setLoading(true);
    setError(null);
  }, [uri, onFullscreenChange]);

  const hookedSourceRef = useRef(sourceUrl);
  useEffect(() => {
    if (hookedSourceRef.current === sourceUrl) return;
    hookedSourceRef.current = sourceUrl;
    try {
      player.replace(sourceUrl);
      player.play();
    } catch {
      // Playback can still start from the source passed to useVideoPlayer.
    }
  }, [player, sourceUrl]);

  // Safari never reaches canplay on a raw MKV, so expo-video stays "loading".
  // Clear our overlay from the real <video> element as soon as HLS actually plays.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const markStarted = () => {
      startedRef.current = true;
      setLoading(false);
    };
    const bound = new Set<HTMLVideoElement>();
    const bind = (video: HTMLVideoElement) => {
      if (bound.has(video)) return;
      bound.add(video);
      video.addEventListener('loadedmetadata', markStarted);
      video.addEventListener('canplay', markStarted);
      video.addEventListener('playing', markStarted);
    };
    document.querySelectorAll('video').forEach((node) => bind(node));
    const observer = new MutationObserver(() => {
      document.querySelectorAll('video').forEach((node) => bind(node));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      bound.forEach((video) => {
        video.removeEventListener('loadedmetadata', markStarted);
        video.removeEventListener('canplay', markStarted);
        video.removeEventListener('playing', markStarted);
      });
    };
  }, [sourceUrl]);

  // setup() often runs before <video> mounts, so play() is a no-op; retry after mount.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const timer = setTimeout(() => {
      try {
        player.play();
      } catch {
        // Autoplay may still be blocked until the user hits native controls.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [player]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const controller = new AbortController();
    const mounted = player;
    // Subtitles always extract from the original MKV URL, not the remux pipe.
    void loadWebVideoSubtitles(mounted, originalUrl, controller.signal).catch(
      () => {
        // Keep playback going if SoftSub extract fails.
      },
    );
    return () => {
      controller.abort();
      disposeWebVideoSubtitles(mounted);
    };
  }, [originalUrl, player]);

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
      if (startedRef.current) return;
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
        iosMkv
          ? strings.playbackWebRemuxFailed
          : isCodecError(message)
            ? strings.playbackCodecUnsupported
            : message,
      );
    }
  });

  const openExternal = () => {
    void Linking.openURL(originalUrl);
  };

  return (
    <View style={fullscreen ? styles.wrapperFullscreen : styles.wrapper}>
      {fullscreen ? <StatusBar hidden /> : null}
      <VideoView
        ref={viewRef}
        style={styles.video}
        player={player}
        nativeControls
        playsInline
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
          <Text style={styles.overlayText}>
            {iosMkv ? strings.playbackWebRemuxing : strings.playbackLoading}
          </Text>
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
          {Platform.OS === 'web' ? (
            <Pressable
              onPress={openExternal}
              style={({ pressed }) => [
                styles.retryBtn,
                styles.retryBtnSecondary,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={strings.openExternalFile}
            >
              <Text style={styles.retryBtnText}>{strings.openExternalFile}</Text>
            </Pressable>
          ) : null}
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
    textAlign: 'center',
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
  retryBtnSecondary: {
    backgroundColor: colors.backgroundSoft,
    borderWidth: 1,
    borderColor: colors.border,
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
