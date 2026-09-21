import { Ionicons } from '@expo/vector-icons';
import VLCPlayer, {
  type VLCPlayerRef,
  type VLCPlayerTracks,
  type VLCTrack,
} from '@lunarr/vlc-player';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { encodeMediaUrl } from '../lib/catalog/videoSource';
import { pickPreferredNamedTrack } from '../lib/player/subtitlePicker';

const SEEK_STEP = 15;
const HIDE_CONTROLS_MS = 2500;

type VideoPlayerProps = {
  uri: string;
  initialTime?: number;
  onFullscreenChange?: (fullscreen: boolean) => void;
  onProgress?: (progress: { currentTime: number; duration: number }) => void;
};

async function lockOrientation(fullscreen: boolean) {
  try {
    await ScreenOrientation.lockAsync(
      fullscreen
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  } catch {
    // Native module may be missing until the iOS binary is rebuilt.
  }
}

function padFa(n: number) {
  return n.toLocaleString('fa-IR', {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return `۰:${padFa(0)}`;
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h.toLocaleString('fa-IR')}:${padFa(m)}:${padFa(s)}`;
  }
  return `${m.toLocaleString('fa-IR')}:${padFa(s)}`;
}

export function VideoPlayer({
  uri,
  initialTime = 0,
  onFullscreenChange,
  onProgress,
}: VideoPlayerProps) {
  const sourceUri = useMemo(() => encodeMediaUrl(uri), [uri]);
  const insets = useSafeAreaInsets();
  const playerRef = useRef<VLCPlayerRef>(null);
  const selectedRef = useRef(false);
  const preferredSubId = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubbing = useRef(false);
  const durationRef = useRef(0);
  const didResume = useRef(false);
  const onProgressRef = useRef(onProgress);
  const positionRef = useRef(0);
  const lastReportAt = useRef(0);
  onProgressRef.current = onProgress;

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [subtitleTracks, setSubtitleTracks] = useState<VLCTrack[]>([]);
  const [subtitleOn, setSubtitleOn] = useState(false);

  durationRef.current = duration;

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = useCallback((isPaused: boolean) => {
    clearHideTimer();
    if (isPaused) return;
    hideTimer.current = setTimeout(() => {
      setControlsVisible(false);
    }, HIDE_CONTROLS_MS);
  }, []);

  const showControls = useCallback(
    (keepPaused = paused) => {
      setControlsVisible(true);
      scheduleHide(keepPaused);
    },
    [paused, scheduleHide],
  );

  const setFullscreenMode = (next: boolean) => {
    setFullscreen(next);
    onFullscreenChange?.(next);
    void lockOrientation(next);
    showControls(paused);
  };

  useEffect(() => {
    setFullscreen(false);
    onFullscreenChange?.(false);
    void lockOrientation(false);
    setPosition(0);
    setDuration(0);
    setSubtitleTracks([]);
    setSubtitleOn(false);
    setMuted(false);
    setControlsVisible(true);
    selectedRef.current = false;
    preferredSubId.current = null;
    didResume.current = false;
    return () => {
      onProgressRef.current?.({
        currentTime: positionRef.current,
        duration: durationRef.current,
      });
      clearHideTimer();
      void lockOrientation(false);
    };
  }, [uri, onFullscreenChange]);

  useEffect(() => {
    scheduleHide(paused);
    return clearHideTimer;
  }, [paused, scheduleHide]);

  const applyProgress = (currentTime: number, nextDuration: number) => {
    if (nextDuration > 0) setDuration(nextDuration);
    if (!scrubbing.current) setPosition(currentTime);
    positionRef.current = currentTime;
    const now = Date.now();
    if (now - lastReportAt.current < 4000) return;
    lastReportAt.current = now;
    onProgressRef.current?.({
      currentTime,
      duration: nextDuration > 0 ? nextDuration : durationRef.current,
    });
  };

  const seekTo = (time: number) => {
    const cap = durationRef.current;
    const next = Math.max(0, cap > 0 ? Math.min(cap, time) : time);
    setPosition(next);
    playerRef.current?.seek(next);
  };

  const togglePlay = () => {
    if (error) return;
    const next = !paused;
    setPaused(next);
    if (next) playerRef.current?.pause();
    else playerRef.current?.play();
    showControls(next);
  };

  const onTracks = (tracks: VLCPlayerTracks) => {
    setSubtitleTracks(tracks.subtitle);
    if (!selectedRef.current) {
      const track = pickPreferredNamedTrack(tracks.subtitle);
      if (track) {
        preferredSubId.current = track.id;
        playerRef.current?.selectSubtitleTrack(track.id);
        setSubtitleOn(true);
      }
      selectedRef.current = true;
      return;
    }
    setSubtitleOn(tracks.subtitleIndex >= 0);
  };

  const toggleSubtitle = () => {
    if (!subtitleTracks.length) return;
    if (subtitleOn) {
      playerRef.current?.selectSubtitleTrack(-1);
      setSubtitleOn(false);
    } else {
      const id =
        preferredSubId.current ?? pickPreferredNamedTrack(subtitleTracks)?.id;
      if (id == null) return;
      playerRef.current?.selectSubtitleTrack(id);
      setSubtitleOn(true);
    }
    showControls();
  };

  const bottomPad = fullscreen ? Math.max(insets.bottom, 12) : 10;
  const sidePad = fullscreen ? Math.max(insets.left, insets.right, 16) : 12;

  return (
    <View style={fullscreen ? styles.wrapperFullscreen : styles.wrapper}>
      {fullscreen ? <StatusBar hidden /> : null}
      <VLCPlayer
        key={sourceUri}
        ref={playerRef}
        style={styles.video}
        source={{
          uri: sourceUri,
          isNetwork: true,
          autoplay: true,
          mediaOptions: [
            ':network-caching=3000',
            ':freetype-rel-fontsize=18',
            ':freetype-bold',
          ],
        }}
        autoplay
        paused={paused}
        muted={muted}
        resizeMode="contain"
        continueAudioInBackground={false}
        showNowPlaying={false}
        progressUpdateInterval={250}
        onLoadStart={() => {
          selectedRef.current = false;
          setLoading(true);
          setReady(false);
          setError(null);
        }}
        onLoad={({ currentTime, duration: nextDuration }) => {
          applyProgress(currentTime, nextDuration);
          if (!didResume.current && initialTime > 1) {
            didResume.current = true;
            const cap = nextDuration > 0 ? nextDuration : durationRef.current;
            const next = Math.max(
              0,
              cap > 0 ? Math.min(cap, initialTime) : initialTime,
            );
            playerRef.current?.seek(next);
            setPosition(next);
            positionRef.current = next;
          }
        }}
        onProgress={({ currentTime, duration: nextDuration }) => {
          applyProgress(currentTime, nextDuration);
        }}
        onBuffer={({ isBuffering }) => {
          setLoading(Boolean(isBuffering));
        }}
        onPlaying={() => {
          setLoading(false);
          setReady(true);
          setError(null);
          setPaused(false);
        }}
        onPaused={() => setPaused(true)}
        onError={() => {
          setLoading(false);
          setError(strings.playbackFailed);
        }}
        onTracks={onTracks}
      />

      {error ? null : controlsVisible ? (
        <View style={styles.controlsRoot} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setControlsVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={strings.nowPlaying}
          />
          <LinearGradient
            colors={['rgba(7,8,12,0.72)', 'transparent']}
            style={styles.topShade}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', 'rgba(7,8,12,0.88)']}
            pointerEvents="box-none"
            style={[
              styles.bottomBar,
              { paddingBottom: bottomPad, paddingHorizontal: sidePad },
            ]}
          >
            <View style={styles.timeRow} pointerEvents="none">
              <Text style={styles.time}>{formatClock(position)}</Text>
              <Text style={styles.time}>{formatClock(duration)}</Text>
            </View>
            <Seeker
              position={position}
              duration={duration}
              onScrubStart={() => {
                scrubbing.current = true;
                clearHideTimer();
              }}
              onScrub={(time) => setPosition(time)}
              onScrubEnd={(time) => {
                seekTo(time);
                scrubbing.current = false;
                showControls();
              }}
            />
            <View style={styles.bottomButtons}>
              <ControlButton
                icon={subtitleOn ? 'text' : 'text-outline'}
                active={subtitleOn}
                disabled={!subtitleTracks.length}
                accessibilityLabel={
                  !subtitleTracks.length
                    ? strings.playerNoSubtitles
                    : subtitleOn
                      ? strings.playerSubtitlesOff
                      : strings.playerSubtitlesOn
                }
                onPress={toggleSubtitle}
              />
              <ControlButton
                icon={muted ? 'volume-mute' : 'volume-high'}
                accessibilityLabel={
                  muted ? strings.playerUnmute : strings.playerMute
                }
                onPress={() => {
                  setMuted((value) => !value);
                  showControls();
                }}
              />
              <View style={styles.bottomSpacer} />
              <ControlButton
                icon={fullscreen ? 'contract' : 'expand'}
                accessibilityLabel={
                  fullscreen
                    ? strings.playerExitFullscreen
                    : strings.playerFullscreen
                }
                onPress={() => setFullscreenMode(!fullscreen)}
              />
            </View>
          </LinearGradient>
          <View style={styles.centerWrap} pointerEvents="box-none">
            <View style={styles.centerRow} pointerEvents="auto">
              <ControlButton
                icon="play-back"
                label="۱۵"
                accessibilityLabel={strings.playerSeekBack}
                onPress={() => {
                  seekTo(position - SEEK_STEP);
                  showControls();
                }}
              />
              <ControlButton
                icon={paused ? 'play' : 'pause'}
                large
                accessibilityLabel={
                  paused ? strings.playerPlay : strings.playerPause
                }
                onPress={togglePlay}
              />
              <ControlButton
                icon="play-forward"
                label="۱۵"
                accessibilityLabel={strings.playerSeekForward}
                onPress={() => {
                  seekTo(position + SEEK_STEP);
                  showControls();
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <Pressable
          style={styles.tapLayer}
          onPress={() => showControls()}
          accessibilityRole="button"
          accessibilityLabel={strings.tapToResume}
        />
      )}

      {loading && !error ? (
        <View
          style={ready ? styles.bufferSpinner : styles.overlay}
          pointerEvents="none"
        >
          <ActivityIndicator color={colors.accent} />
          {ready ? null : (
            <Text style={styles.overlayText}>{strings.playbackLoading}</Text>
          )}
        </View>
      ) : null}
      {error ? (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => {
              setError(null);
              setLoading(true);
              selectedRef.current = false;
              setPaused(false);
              playerRef.current?.play();
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

function ControlButton({
  icon,
  label,
  large,
  active,
  disabled,
  accessibilityLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  large?: boolean;
  active?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      pointerEvents="auto"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        large ? styles.ctrlLarge : styles.ctrl,
        active && styles.ctrlActive,
        (pressed || disabled) && styles.pressed,
        disabled && styles.ctrlDisabled,
      ]}
    >
      <Ionicons name={icon} size={large ? 20 : 14} color={colors.text} />
      {label ? <Text style={styles.ctrlLabel}>{label}</Text> : null}
    </Pressable>
  );
}

function Seeker({
  position,
  duration,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: {
  position: number;
  duration: number;
  onScrubStart: () => void;
  onScrub: (time: number) => void;
  onScrubEnd: (time: number) => void;
}) {
  const trackRef = useRef<View>(null);
  const frame = useRef({ x: 0, width: 1 });
  const ratio = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  const measureTrack = () => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      if (width > 0) frame.current = { x, width };
    });
  };

  const timeFromPageX = (pageX: number) => {
    const { x, width } = frame.current;
    if (width <= 0 || duration <= 0) return 0;
    const ratioAt = Math.max(0, Math.min(1, (pageX - x) / width));
    return ratioAt * duration;
  };

  return (
    <View
      ref={trackRef}
      collapsable={false}
      style={styles.seekHit}
      onLayout={measureTrack}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        measureTrack();
        onScrubStart();
        onScrub(timeFromPageX(event.nativeEvent.pageX));
      }}
      onResponderMove={(event) => {
        onScrub(timeFromPageX(event.nativeEvent.pageX));
      }}
      onResponderRelease={(event) => {
        onScrubEnd(timeFromPageX(event.nativeEvent.pageX));
      }}
      onResponderTerminate={(event) => {
        onScrubEnd(timeFromPageX(event.nativeEvent.pageX));
      }}
    >
      <View style={styles.seekTrack} pointerEvents="none">
        <View style={[styles.seekFill, { width: `${ratio * 100}%` }]} />
        <View
          style={[styles.seekThumb, { left: `${ratio * 100}%` }]}
        />
      </View>
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
  tapLayer: {
    ...StyleSheet.absoluteFill,
  },
  controlsRoot: {
    ...StyleSheet.absoluteFill,
  },
  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  centerWrap: {
    ...StyleSheet.absoluteFill,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    direction: 'ltr',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    paddingTop: 28,
    gap: 8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    direction: 'ltr',
  },
  time: {
    color: colors.text,
    fontSize: 12,
    fontFamily: fonts.medium,
    writingDirection: 'ltr',
  },
  seekHit: {
    height: 28,
    justifyContent: 'center',
    direction: 'ltr',
  },
  seekTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'visible',
  },
  seekFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  seekThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: colors.text,
  },
  bottomButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomSpacer: {
    flex: 1,
  },
  ctrl: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
    backgroundColor: 'rgba(7, 8, 12, 0.45)',
  },
  ctrlLarge: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 8, 12, 0.62)',
  },
  ctrlActive: {
    backgroundColor: colors.accentSoft,
  },
  ctrlDisabled: {
    opacity: 0.35,
  },
  ctrlLabel: {
    color: colors.text,
    fontSize: 10,
    fontFamily: fonts.medium,
  },
  bufferSpinner: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
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
