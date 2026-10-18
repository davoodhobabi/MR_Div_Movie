import { useEventListener } from 'expo';
import {
  useVideoPlayer,
  VideoView,
  type AudioTrack,
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
  audioTrackLabels,
  type RemoteAudioTrack,
} from '../lib/catalog/audioLabel';
import {
  encodeMediaUrl,
  isHtml5UnsupportedMediaUrl,
} from '../lib/catalog/videoSource';
import { webMediaHlsMetaUrl, webMediaHlsUrl } from '../lib/catalog/webProxy';
import { isAndroidTv } from '../lib/tv';
import { attachWebHls } from '../lib/player/attachWebHls';
import {
  pickPreferredSubtitle,
  subtitleLabel,
} from '../lib/player/subtitlePicker';
import {
  disposeWebVideoSubtitles,
  loadWebVideoSubtitles,
  readWebSubtitles,
  selectWebSubtitle,
} from '../lib/player/webSubtitleTracks';
import { WebPlayerControls } from './WebPlayerControls';

const useCustomControls = Platform.OS === 'web' || Platform.OS === 'android';

function nativeAudioAsRemote(tracks: AudioTrack[]): RemoteAudioTrack[] {
  return tracks.map((track, index) => ({
    index,
    language: track.language,
    title: track.name || track.label,
    default: track.isDefault,
  }));
}

function trackKey(track: { id?: string; language?: string; label?: string; name?: string }) {
  return track.id || `${track.language || ''}:${track.label || track.name || ''}`;
}

type VideoPlayerProps = {
  uri: string;
  initialTime?: number;
  onFullscreenChange?: (fullscreen: boolean) => void;
  onProgress?: (progress: { currentTime: number; duration: number }) => void;
};

function webNeedsHls(uri: string) {
  return Platform.OS === 'web' && isHtml5UnsupportedMediaUrl(uri);
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
  const webHls = webNeedsHls(uri);
  const [audioIndex, setAudioIndex] = useState(0);
  const [audioTracks, setAudioTracks] = useState<RemoteAudioTrack[]>([]);
  const [nativeAudioTracks, setNativeAudioTracks] = useState<AudioTrack[]>([]);
  const [playing, setPlaying] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [clock, setClock] = useState({ currentTime: 0, duration: 0 });
  const [subtitles, setSubtitles] = useState<{ id: string; label: string }[]>([]);
  const [subtitleId, setSubtitleId] = useState<string | null>(null);
  const sourceUrl = webHls
    ? webMediaHlsUrl(originalUrl, audioIndex)
    : originalUrl;
  const labeledAudioTracks = useMemo(
    () =>
      webHls
        ? audioTracks
        : nativeAudioAsRemote(nativeAudioTracks),
    [webHls, audioTracks, nativeAudioTracks],
  );
  const audioLabels = useMemo(
    () => audioTrackLabels(labeledAudioTracks),
    [labeledAudioTracks],
  );
  const selectedRef = useRef(false);
  const didSeekRef = useRef(false);
  const startedRef = useRef(false);
  const pendingSeekRef = useRef(0);
  const boxRef = useRef<View>(null);
  const viewRef = useRef<VideoView>(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [subtitleLift, setSubtitleLift] = useState(0);

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
    pendingSeekRef.current = 0;
    setAudioIndex(0);
    setAudioTracks([]);
    setNativeAudioTracks([]);
    setSubtitles([]);
    setSubtitleId(null);
    setPlaying(true);
    setRate(1);
    setVolume(1);
    setMuted(false);
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

  useEffect(() => {
    if (!webHls) return;
    let cancelled = false;
    void fetch(webMediaHlsMetaUrl(originalUrl))
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { audioTracks?: RemoteAudioTrack[] } | null) => {
        if (cancelled || !Array.isArray(body?.audioTracks)) return;
        setAudioTracks(body.audioTracks.filter((track) => Number.isFinite(track.index)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [originalUrl, webHls]);

  useEffect(() => {
    if (!webHls || Platform.OS !== 'web') return;
    let dispose = () => {};
    let cancelled = false;
    const timer = setTimeout(() => {
      const node = boxRef.current as unknown as { querySelector?: (selector: string) => HTMLVideoElement | null };
      const video = node?.querySelector?.('video');
      if (!video || cancelled) return;
      void attachWebHls(video, sourceUrl, pendingSeekRef.current).then((stop) => {
        if (cancelled) stop();
        else dispose = stop;
      });
    }, 40);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      dispose();
    };
  }, [sourceUrl, webHls]);

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
    if (!useCustomControls) return;
    try {
      player.playbackRate = rate;
      player.volume = muted ? 0 : volume;
      player.muted = muted || volume === 0;
    } catch {
      // The element may not be mounted yet.
    }
  }, [player, rate, volume, muted, sourceUrl]);

  useEffect(() => {
    if (!useCustomControls) return;
    const timer = setInterval(() => {
      try {
        setClock({
          currentTime: player.currentTime || 0,
          duration: Number.isFinite(player.duration) ? player.duration : 0,
        });
        if (Platform.OS === 'web') {
          const node = boxRef.current as unknown as {
            querySelector?: (selector: string) => HTMLVideoElement | null;
          };
          const video = node?.querySelector?.('video');
          if (!video) return;
          const snapshot = readWebSubtitles(video);
          setSubtitles(snapshot.options);
          setSubtitleId(snapshot.activeId);
          return;
        }
        const tracks = player.availableSubtitleTracks || [];
        setSubtitles(
          tracks.map((track) => ({
            id: trackKey(track),
            label: subtitleLabel(track) || strings.playerSubtitlesOn,
          })),
        );
        const active = player.subtitleTrack;
        setSubtitleId(active ? trackKey(active) : null);
        const audios = player.availableAudioTracks || [];
        if (audios.length) {
          setNativeAudioTracks(audios);
          const current = player.audioTrack;
          const index = current
            ? audios.findIndex((track) => trackKey(track) === trackKey(current))
            : 0;
          setAudioIndex(index >= 0 ? index : 0);
        }
      } catch {
        // Player may already be released.
      }
    }, 400);
    return () => clearInterval(timer);
  }, [player, sourceUrl]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const sync = () => {
      const mine = boxRef.current as unknown as HTMLElement | null;
      const active = document.fullscreenElement;
      const on = Boolean(mine && active && (active === mine || mine.contains(active)));
      setFullscreen(on);
      onFullscreenChange?.(on);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync as EventListener);
    };
  }, [onFullscreenChange]);

  useEffect(() => {
    if (!fullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isAndroidTv()) {
        setFullscreen(false);
        onFullscreenChange?.(false);
        return true;
      }
      void viewRef.current?.exitFullscreen();
      return true;
    });
    return () => sub.remove();
  }, [fullscreen, onFullscreenChange]);

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
    ({
      availableSubtitleTracks,
      availableAudioTracks,
    }: {
      availableSubtitleTracks: SubtitleTrack[];
      availableAudioTracks: AudioTrack[];
    }) => {
      selectedRef.current = false;
      selectPreferredSubtitle(availableSubtitleTracks);
      if (Platform.OS !== 'web') {
        setNativeAudioTracks(availableAudioTracks || []);
      }
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

  useEventListener(
    player,
    'availableAudioTracksChange',
    ({ availableAudioTracks }: { availableAudioTracks: AudioTrack[] }) => {
      if (Platform.OS === 'web') return;
      setNativeAudioTracks(availableAudioTracks || []);
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
      if (pendingSeekRef.current > 1) {
        try {
          player.currentTime = pendingSeekRef.current;
        } catch {
          // The browser HLS helper seeks on its own metadata event.
        }
        pendingSeekRef.current = 0;
      }
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
        webHls
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

  useEventListener(player, 'playingChange', ({ isPlaying }: { isPlaying: boolean }) => {
    setPlaying(isPlaying);
  });

  const togglePlay = () => {
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch {
      // Ignore play calls before the media element exists.
    }
  };

  const changeVolume = (value: number) => {
    const next = Math.min(1, Math.max(0, value));
    setVolume(next);
    setMuted(next === 0);
    try {
      player.volume = next;
      player.muted = next === 0;
    } catch {
      // Ignore until the element is mounted.
    }
  };

  const changeRate = (next: number) => {
    setRate(next);
    try {
      player.playbackRate = next;
    } catch {
      // Ignore until the element is mounted.
    }
  };

  const changeSubtitle = (id: string | null) => {
    selectedRef.current = true;
    if (Platform.OS === 'web') {
      const node = boxRef.current as unknown as {
        querySelector?: (selector: string) => HTMLVideoElement | null;
      };
      const video = node?.querySelector?.('video');
      if (video) selectWebSubtitle(video, id);
      setSubtitleId(id);
      return;
    }
    try {
      if (id == null) {
        player.subtitleTrack = null;
        setSubtitleId(null);
        return;
      }
      const track = (player.availableSubtitleTracks || []).find(
        (item) => trackKey(item) === id,
      );
      if (!track) return;
      player.subtitleTrack = track;
      setSubtitleId(id);
    } catch {
      // Ignore until tracks are ready.
    }
  };

  const toggleFullscreen = () => {
    if (isAndroidTv()) {
      const next = !fullscreen;
      setFullscreen(next);
      onFullscreenChange?.(next);
      return;
    }
    if (Platform.OS !== 'web') {
      if (fullscreen) void viewRef.current?.exitFullscreen();
      else void viewRef.current?.enterFullscreen();
      return;
    }
    const mine = boxRef.current as unknown as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const active =
      document.fullscreenElement ||
      (document as Document & { webkitFullscreenElement?: Element | null })
        .webkitFullscreenElement;
    if (active) {
      void document.exitFullscreen?.();
      return;
    }
    if (fullscreen) {
      setFullscreen(false);
      onFullscreenChange?.(false);
      return;
    }
    const request = mine?.requestFullscreen?.bind(mine) || mine?.webkitRequestFullscreen?.bind(mine);
    if (!request) {
      setFullscreen(true);
      onFullscreenChange?.(true);
      return;
    }
    void Promise.resolve(request()).catch(() => {
      setFullscreen(true);
      onFullscreenChange?.(true);
    });
  };

  const selectAudio = (position: number) => {
    if (webHls) {
      const track = audioTracks[position];
      if (!track || track.index === audioIndex) return;
      try {
        pendingSeekRef.current = player.currentTime || 0;
      } catch {
        pendingSeekRef.current = 0;
      }
      setLoading(true);
      setAudioIndex(track.index);
      return;
    }
    const track = nativeAudioTracks[position];
    if (!track) return;
    try {
      player.audioTrack = track;
      setAudioIndex(position);
    } catch {
      // Ignore until tracks are ready.
    }
  };

  return (
    <View
      ref={boxRef}
      style={fullscreen ? styles.wrapperFullscreen : styles.wrapper}
    >
      {fullscreen ? <StatusBar hidden /> : null}
      <VideoView
        ref={viewRef}
        style={styles.video}
        player={player}
        nativeControls={!useCustomControls}
        playsInline
        fullscreenOptions={{ enable: !isAndroidTv(), orientation: 'landscape' }}
        allowsPictureInPicture={false}
        contentFit="contain"
        surfaceType="textureView"
        useExoShutter
        subtitleLift={subtitleLift}
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
            {webHls ? strings.playbackWebRemuxing : strings.playbackLoading}
          </Text>
        </View>
      ) : null}
      {useCustomControls && !error ? (
        <WebPlayerControls
          playing={playing}
          onTogglePlay={togglePlay}
          volume={volume}
          muted={muted}
          onVolume={changeVolume}
          audioLabels={audioLabels}
          audioIndex={
            webHls
              ? Math.max(
                  0,
                  audioTracks.findIndex((track) => track.index === audioIndex),
                )
              : audioIndex
          }
          onSelectAudio={selectAudio}
          subtitles={subtitles}
          subtitleId={subtitleId}
          onSelectSubtitle={changeSubtitle}
          rate={rate}
          onRate={changeRate}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          currentTime={clock.currentTime}
          duration={clock.duration}
          onSubtitleInset={isAndroidTv() ? setSubtitleLift : undefined}
          onSeek={(time) => {
            try {
              player.currentTime = time;
              setClock((prev) => ({ ...prev, currentTime: time }));
            } catch {
              // Seek can fail before metadata arrives.
            }
          }}
        />
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
    // On TV, clipping the TextureView detaches its surface and the picture freezes.
    overflow: isAndroidTv() ? 'visible' : 'hidden',
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
