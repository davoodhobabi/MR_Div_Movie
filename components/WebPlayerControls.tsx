import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts } from '../constants/theme';
import { placeWebSubtitles } from '../lib/player/webSubtitleTracks';
import { ltrProps } from '../lib/rtl';
import { isAndroidTv } from '../lib/tv';
import { TvPressable } from './TvPressable';

type Menu = 'volume' | 'audio' | 'subs' | 'speed' | null;

type Props = {
  playing: boolean;
  onTogglePlay: () => void;
  volume: number;
  muted: boolean;
  onVolume: (value: number) => void;
  audioLabels: string[];
  audioIndex: number;
  onSelectAudio: (index: number) => void;
  subtitles: { id: string; label: string }[];
  subtitleId: string | null;
  onSelectSubtitle: (id: string | null) => void;
  rate: number;
  onRate: (rate: number) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
};

const SPEEDS = [1, 2, 4] as const;
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function faNum(value: number) {
  return String(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)] ?? digit);
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const whole = Math.floor(seconds);
  const s = whole % 60;
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  const pad = (n: number) => faNum(n).padStart(2, '۰');
  if (h > 0) return `${faNum(h)}:${pad(m)}:${pad(s)}`;
  return `${faNum(m)}:${pad(s)}`;
}

export function WebPlayerControls({
  playing,
  onTogglePlay,
  volume,
  muted,
  onVolume,
  audioLabels,
  audioIndex,
  onSelectAudio,
  subtitles,
  subtitleId,
  onSelectSubtitle,
  rate,
  onRate,
  fullscreen,
  onToggleFullscreen,
  currentTime,
  duration,
  onSeek,
}: Props) {
  const rootRef = useRef<View>(null);
  const dockRef = useRef<View>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [shown, setShown] = useState(true);
  const shownRef = useRef(true);
  const menuRef = useRef<Menu>(null);
  const seekingRef = useRef(false);
  const playingRef = useRef(playing);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const shift = useRef(new Animated.Value(0)).current;

  menuRef.current = menu;
  playingRef.current = playing;

  const animateTo = (visible: boolean) => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 220 : 460,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shift, {
        toValue: visible ? 0 : 18,
        duration: visible ? 260 : 460,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const armHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (menuRef.current || seekingRef.current) return;
    hideTimer.current = setTimeout(() => {
      if (menuRef.current || seekingRef.current) return;
      shownRef.current = false;
      setShown(false);
      setMenu(null);
      animateTo(false);
    }, 1000);
  };

  const reveal = () => {
    if (!shownRef.current) {
      shownRef.current = true;
      setShown(true);
      animateTo(true);
    }
    armHide();
  };

  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  useEffect(() => {
    armHide();
    if (Platform.OS !== 'web') {
      return () => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
      };
    }
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onActivity = () => revealRef.current();
    node.addEventListener('pointermove', onActivity);
    node.addEventListener('pointerdown', onActivity);
    return () => {
      node.removeEventListener('pointermove', onActivity);
      node.removeEventListener('pointerdown', onActivity);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (menu) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      return;
    }
    armHide();
  }, [menu]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = rootRef.current as unknown as HTMLElement | null;
    const video = root?.parentElement?.querySelector('video') ?? null;
    if (!video) return;
    let cancelled = false;
    const place = (lift: boolean) => {
      if (cancelled) return;
      if (!lift) {
        // Keep a little air above the bottom edge when the dock is hidden.
        placeWebSubtitles(video, 28);
        return;
      }
      const dock = dockRef.current as unknown as HTMLElement | null;
      const videoBox = video.getBoundingClientRect();
      const dockBox = dock?.getBoundingClientRect();
      const overlap = dockBox
        ? Math.max(64, videoBox.bottom - dockBox.top + 28)
        : 106;
      placeWebSubtitles(video, overlap);
    };
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    if (shown) {
      requestAnimationFrame(() => place(true));
    } else {
      restoreTimer = setTimeout(() => place(false), 480);
    }
    const onCue = () => {
      place(shownRef.current);
    };
    const bind = (track: TextTrack) => track.addEventListener('cuechange', onCue);
    const unbind = (track: TextTrack) => track.removeEventListener('cuechange', onCue);
    for (let index = 0; index < video.textTracks.length; index += 1) {
      const track = video.textTracks[index];
      if (track) bind(track);
    }
    const onAdd = (event: Event) => {
      const track = (event as TrackEvent).track;
      if (!track) return;
      bind(track);
      place(shownRef.current);
    };
    video.textTracks.addEventListener('addtrack', onAdd);
    return () => {
      cancelled = true;
      if (restoreTimer) clearTimeout(restoreTimer);
      for (let index = 0; index < video.textTracks.length; index += 1) {
        const track = video.textTracks[index];
        if (track) unbind(track);
      }
      video.textTracks.removeEventListener('addtrack', onAdd);
    };
  }, [shown, menu, fullscreen]);

  const toggleMenu = (next: Menu) => {
    setMenu((current) => (current === next ? null : next));
    reveal();
  };

  const tvMode = isAndroidTv();
  const isTouchDevice = () => {
    if (tvMode) return false;
    if (Platform.OS === 'android' || Platform.OS === 'ios') return true;
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches &&
      window.matchMedia('(hover: none)').matches
    );
  };

  const onSurface = () => {
    const wasShown = shownRef.current;
    reveal();
    if (!wasShown && playingRef.current) return;
    onTogglePlay();
  };

  const anchorRef = useRef(currentTime);
  const tapRef = useRef({ at: 0, zone: 'center' as 'left' | 'center' | 'right' });
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureRef = useRef<{
    x: number;
    y: number;
    zone: 'left' | 'center' | 'right';
    mode: 'none' | 'volume' | 'brightness';
    startVolume: number;
    startBrightness: number;
  } | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const [nudge, setNudge] = useState<'back' | 'forward' | null>(null);
  const [brightness, setBrightness] = useState(1);
  const brightnessRef = useRef(1);
  const [scrubHud, setScrubHud] = useState<{
    kind: 'volume' | 'brightness';
    value: number;
  } | null>(null);

  if (Math.abs(currentTime - anchorRef.current) < 1.5) {
    anchorRef.current = currentTime;
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = rootRef.current as unknown as HTMLElement | null;
    const video = root?.parentElement?.querySelector('video') as HTMLVideoElement | null;
    if (!video) return;
    video.style.filter = `brightness(${brightness})`;
    return () => {
      video.style.filter = '';
    };
  }, [brightness]);

  const jump = (dir: 'back' | 'forward') => {
    const delta = dir === 'back' ? -20 : 20;
    const cap = Number.isFinite(duration) && duration > 0 ? duration : anchorRef.current + 20;
    const next = Math.min(cap, Math.max(0, anchorRef.current + delta));
    anchorRef.current = next;
    onSeek(next);
    setNudge(dir);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudge(null), 650);
    reveal();
  };

  const pointFromEvent = (event: GestureResponderEvent) => {
    const node = rootRef.current as unknown as HTMLElement | null;
    const box = node?.getBoundingClientRect?.();
    const pageX = event.nativeEvent.pageX;
    const pageY = event.nativeEvent.pageY;
    const x =
      box && typeof pageX === 'number'
        ? pageX - box.left
        : event.nativeEvent.locationX;
    const y =
      box && typeof pageY === 'number'
        ? pageY - box.top
        : event.nativeEvent.locationY;
    return { x, y, height: box?.height || 1, width: box?.width || 1 };
  };

  const zoneFromPoint = (x: number, width: number) => {
    const ratio = x / (width || 1);
    if (ratio < 0.38) return 'left' as const;
    if (ratio > 0.62) return 'right' as const;
    return 'center' as const;
  };

  const finishTap = (zone: 'left' | 'center' | 'right') => {
    if (tvMode) {
      onSurface();
      return;
    }
    const touch = isTouchDevice();
    if (!touch) {
      if (zone === 'left') jump('back');
      else if (zone === 'right') jump('forward');
      else onSurface();
      return;
    }
    const now = Date.now();
    const doubled = now - tapRef.current.at < 300 && tapRef.current.zone === zone;
    tapRef.current = { at: now, zone };
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    if (doubled && zone !== 'center') {
      jump(zone === 'left' ? 'back' : 'forward');
      return;
    }
    // Mobile single tap: only show controls, never play/pause.
    singleTapTimer.current = setTimeout(() => reveal(), 280);
  };

  const onCatcherGrant = (event: GestureResponderEvent) => {
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    const point = pointFromEvent(event);
    const zone = zoneFromPoint(point.x, point.width);
    gestureRef.current = {
      x: point.x,
      y: point.y,
      zone,
      mode: 'none',
      startVolume: muted ? 0 : volumeRef.current,
      startBrightness: brightnessRef.current,
    };
  };

  const onCatcherMove = (event: GestureResponderEvent) => {
    if (tvMode) return;
    const gesture = gestureRef.current;
    if (!gesture) return;
    const point = pointFromEvent(event);
    const dx = point.x - gesture.x;
    const dy = point.y - gesture.y;
    if (gesture.mode === 'none') {
      if (Math.abs(dy) < 12 || Math.abs(dy) <= Math.abs(dx) * 1.2) return;
      if (gesture.zone === 'left') gesture.mode = 'volume';
      else if (gesture.zone === 'right') gesture.mode = 'brightness';
      else return;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    }
    const delta = -dy / Math.max(160, point.height * 0.55);
    if (gesture.mode === 'volume') {
      const next = Math.min(1, Math.max(0, gesture.startVolume + delta));
      onVolume(next);
      setScrubHud({ kind: 'volume', value: next });
      return;
    }
    if (gesture.mode === 'brightness') {
      const next = Math.min(1.4, Math.max(0.2, gesture.startBrightness + delta));
      brightnessRef.current = next;
      setBrightness(next);
      setScrubHud({ kind: 'brightness', value: (next - 0.2) / 1.2 });
    }
  };

  const onCatcherRelease = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) return;
    if (gesture.mode !== 'none') {
      setScrubHud(null);
      armHide();
      return;
    }
    finishTap(gesture.zone);
  };

  const compact = !fullscreen && isTouchDevice() && !tvMode;
  const dimOverlay = Math.max(0, Math.min(0.75, 1 - brightness));
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const loud = !muted && volume > 0;
  const volumeIcon = !loud
    ? 'volume-mute'
    : volume < 0.45
      ? 'volume-low'
      : 'volume-high';

  return (
    <View ref={rootRef} style={styles.root} pointerEvents="box-none">
      <View
        style={styles.catcher}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => !tvMode}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onCatcherGrant}
        onResponderMove={onCatcherMove}
        onResponderRelease={onCatcherRelease}
        onResponderTerminate={onCatcherRelease}
        accessibilityRole="button"
        accessibilityLabel={strings.playerPlayLabel}
      />
      {Platform.OS !== 'web' && dimOverlay > 0.02 ? (
        <View
          pointerEvents="none"
          style={[styles.dimOverlay, { opacity: dimOverlay }]}
        />
      ) : null}
      {nudge ? (
        <View
          pointerEvents="none"
          style={[styles.nudge, nudge === 'back' ? styles.nudgeLeft : styles.nudgeRight]}
        >
          <Text style={styles.nudgeText}>
            {nudge === 'back' ? `−${faNum(20)}` : `+${faNum(20)}`}
          </Text>
        </View>
      ) : null}
      {scrubHud ? (
        <View {...ltrProps} pointerEvents="none" style={styles.scrubHud}>
          <Ionicons
            name={
              scrubHud.kind === 'volume'
                ? scrubHud.value === 0
                  ? 'volume-mute'
                  : scrubHud.value < 0.45
                    ? 'volume-low'
                    : 'volume-high'
                : 'sunny'
            }
            size={28}
            color="#fff"
          />
          <View style={styles.scrubRail}>
            <View style={[styles.scrubFill, { height: `${scrubHud.value * 100}%` }]} />
          </View>
          <Text style={styles.scrubPct}>
            {faNum(Math.round(scrubHud.value * 100))}
          </Text>
        </View>
      ) : null}
      <Animated.View
        pointerEvents={shown ? 'box-none' : 'none'}
        style={[styles.fade, { opacity, transform: [{ translateY: shift }] }]}
      >
        {!playing ? (
          <View style={styles.centerWrap} pointerEvents="box-none">
            <ControlPressable
              onPress={onTogglePlay}
              accessibilityRole="button"
              accessibilityLabel={strings.playerPlayLabel}
              style={({ pressed }) => [
                styles.centerPlay,
                compact && styles.centerPlayCompact,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="play"
                size={compact ? 22 : 34}
                color="#fff"
                style={styles.playNudge}
              />
            </ControlPressable>
          </View>
        ) : null}

        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.82)']}
          locations={[0, 0.42, 1]}
          style={[styles.shade, compact && styles.shadeCompact]}
          pointerEvents="box-none"
        >
          <View ref={dockRef} pointerEvents="box-none">
          {menu === 'audio' || menu === 'subs' || menu === 'speed' ? (
            <View style={styles.sheet}>
              {menu === 'speed' ? (
                <View style={styles.speedRow}>
                  {SPEEDS.map((value) => (
                    <ControlPressable
                      key={value}
                      onPress={() => {
                        onRate(value);
                        setMenu(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={strings.playerSpeedLabel(value)}
                      style={[styles.speedChip, rate === value && styles.speedChipOn]}
                    >
                      <Text style={[styles.speedText, rate === value && styles.speedTextOn]}>
                        {faNum(value)}×
                      </Text>
                    </ControlPressable>
                  ))}
                </View>
              ) : null}
              {menu === 'audio'
                ? audioLabels.length
                  ? audioLabels.map((label, index) => (
                      <SheetRow
                        key={`${label}-${index}`}
                        label={label}
                        selected={index === audioIndex}
                        onPress={() => {
                          onSelectAudio(index);
                          setMenu(null);
                        }}
                      />
                    ))
                  : <Text style={styles.empty}>{strings.playerAudio}</Text>
                : null}
              {menu === 'subs' ? (
                <>
                  <SheetRow
                    label={strings.playerSubtitleOff}
                    selected={subtitleId == null}
                    onPress={() => {
                      onSelectSubtitle(null);
                      setMenu(null);
                    }}
                  />
                  {subtitles.length ? (
                    subtitles.map((track) => (
                      <SheetRow
                        key={track.id}
                        label={track.label}
                        selected={track.id === subtitleId}
                        onPress={() => {
                          onSelectSubtitle(track.id);
                          setMenu(null);
                        }}
                      />
                    ))
                  ) : (
                    <Text style={styles.empty}>{strings.playerNoSubtitles}</Text>
                  )}
                </>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.bar, compact && styles.barCompact]}>
          <SeekBar
            compact={compact}
            progress={progress}
            duration={duration}
            onSeek={onSeek}
            onDragStart={() => {
              seekingRef.current = true;
              if (hideTimer.current) clearTimeout(hideTimer.current);
            }}
            onDragEnd={() => {
              seekingRef.current = false;
              armHide();
            }}
          />

          <View style={styles.row}>
            <IconButton
              icon={playing ? 'pause' : 'play'}
              label={playing ? strings.playerPauseLabel : strings.playerPlayLabel}
              large
              compact={compact}
              onPress={onTogglePlay}
            />
            <Text style={[styles.time, compact && styles.timeCompact]}>
              {formatClock(currentTime)}
              <Text style={styles.timeDim}> / {formatClock(duration)}</Text>
            </Text>
            <View style={styles.spacer} />
            <View style={styles.volumeSlot}>
              {menu === 'volume' ? (
                <VerticalVolume
                  value={loud ? volume : 0}
                  onChange={(value) => {
                    onVolume(value);
                    reveal();
                  }}
                />
              ) : null}
              <IconButton
                icon={volumeIcon}
                label={strings.playerVolumeSettings}
                active={!loud}
                compact={compact}
                onPress={() => toggleMenu('volume')}
              />
            </View>
            <IconButton
              icon="headset"
              label={strings.playerChangeAudio}
              active={menu === 'audio'}
              compact={compact}
              onPress={() => toggleMenu('audio')}
            />
            <IconButton
              icon="text"
              label={strings.playerChangeSubtitle}
              active={menu === 'subs' || subtitleId != null}
              compact={compact}
              onPress={() => toggleMenu('subs')}
            />
            <ControlPressable
              onPress={() => toggleMenu('speed')}
              accessibilityRole="button"
              accessibilityLabel={strings.playerSpeedLabel(rate)}
              style={({ pressed }) => [
                styles.rateBtn,
                compact && styles.rateBtnCompact,
                (menu === 'speed' || rate !== 1) && styles.rateBtnOn,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.rateText,
                  compact && styles.rateTextCompact,
                  rate !== 1 && styles.rateTextOn,
                ]}
              >
                {faNum(rate)}×
              </Text>
            </ControlPressable>
            <IconButton
              icon={fullscreen ? 'contract' : 'expand'}
              label={fullscreen ? strings.playerExitFullscreen : strings.playerFullscreenLabel}
              compact={compact}
              onPress={onToggleFullscreen}
            />
          </View>
          </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function ControlPressable(props: ComponentProps<typeof Pressable>) {
  if (isAndroidTv()) {
    return <TvPressable {...props} />;
  }
  return <Pressable {...props} />;
}

function IconButton({
  icon,
  label,
  onPress,
  active,
  large,
  compact,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  large?: boolean;
  compact?: boolean;
}) {
  const size = compact ? (large ? 18 : 15) : large ? 26 : 22;
  return (
    <ControlPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={compact ? 4 : 6}
      style={({ pressed }) => [
        styles.iconBtn,
        large && styles.iconBtnLarge,
        compact && styles.iconBtnCompact,
        compact && large && styles.iconBtnLargeCompact,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={size} color={active ? colors.accent : '#fff'} />
    </ControlPressable>
  );
}

function SheetRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <ControlPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
    >
      <Text style={[styles.sheetText, selected && styles.sheetTextOn]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : <View style={styles.checkSpacer} />}
    </ControlPressable>
  );
}

function SeekBar({
  compact,
  progress,
  duration,
  onSeek,
  onDragStart,
  onDragEnd,
}: {
  compact?: boolean;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const widthRef = useRef(1);
  const fromEvent = (event: GestureResponderEvent) => {
    if (duration <= 0 || widthRef.current <= 0) return;
    const ratio = Math.min(
      1,
      Math.max(0, event.nativeEvent.locationX / widthRef.current),
    );
    onSeek(ratio * duration);
  };
  return (
    <View
      {...ltrProps}
      style={[styles.seek, compact && styles.seekCompact]}
      onLayout={(event) => {
        widthRef.current = Math.max(1, event.nativeEvent.layout.width);
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        onDragStart();
        fromEvent(event);
      }}
      onResponderMove={fromEvent}
      onResponderRelease={onDragEnd}
      onResponderTerminate={onDragEnd}
    >
      <View style={[styles.seekRail, compact && styles.seekRailCompact]}>
        <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
      </View>
      <View
        style={[
          styles.knob,
          compact && styles.knobCompact,
          { left: `${progress * 100}%` },
        ]}
      />
    </View>
  );
}

function VerticalVolume({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const heightRef = useRef(1);
  const at = (event: GestureResponderEvent) => {
    if (heightRef.current <= 0) return;
    const ratio = 1 - event.nativeEvent.locationY / heightRef.current;
    onChange(Math.min(1, Math.max(0, ratio)));
  };
  return (
    <View style={styles.volumePop}>
      <Text style={styles.volumePct}>{faNum(Math.round(value * 100))}</Text>
      <View
        style={styles.volumeTrack}
        onLayout={(event) => {
          heightRef.current = Math.max(1, event.nativeEvent.layout.height);
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={at}
        onResponderMove={at}
      >
        <View style={styles.volumeRail}>
          <View style={[styles.volumeFill, { height: `${value * 100}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
  },
  catcher: {
    ...StyleSheet.absoluteFill,
    // Prevent the page from scrolling while adjusting volume/brightness.
    // @ts-expect-error web-only CSS
    touchAction: 'none',
  },
  dimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    zIndex: 2,
  },
  scrubHud: {
    position: 'absolute',
    top: '28%',
    left: '50%',
    marginLeft: -28,
    width: 56,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(7,8,12,0.72)',
    zIndex: 3,
  },
  scrubRail: {
    width: 4,
    height: 88,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  scrubFill: {
    width: '100%',
    backgroundColor: '#fff',
  },
  scrubPct: {
    color: '#fff',
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  nudge: {
    position: 'absolute',
    top: '12%',
    bottom: '12%',
    width: '38%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    zIndex: 2,
  },
  nudgeLeft: {
    left: 0,
    borderTopRightRadius: 160,
    borderBottomRightRadius: 160,
  },
  nudgeRight: {
    right: 0,
    borderTopLeftRadius: 160,
    borderBottomLeftRadius: 160,
  },
  nudgeText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 28,
  },
  fade: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  centerWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlay: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  centerPlayCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  playNudge: {
    marginLeft: 4,
  },
  shade: {
    paddingTop: 48,
    paddingBottom: 10,
    paddingHorizontal: 10,
  },
  shadeCompact: {
    paddingTop: 22,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  bar: {
    borderRadius: 16,
    backgroundColor: 'rgba(7, 8, 12, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingTop: 2,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  barCompact: {
    borderRadius: 12,
    paddingTop: 0,
    paddingBottom: 1,
    paddingHorizontal: 2,
  },
  sheet: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginLeft: 8,
    minWidth: 148,
    maxWidth: '86%',
    borderRadius: 14,
    backgroundColor: 'rgba(12,14,18,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    paddingVertical: 4,
  },
  sheetRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sheetText: {
    color: '#fff',
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'right',
  },
  sheetTextOn: {
    fontFamily: fonts.bold,
  },
  checkSpacer: {
    width: 16,
  },
  empty: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: fonts.regular,
    fontSize: 12,
    textAlign: 'right',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  speedRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  speedChip: {
    minWidth: 52,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  speedChipOn: {
    backgroundColor: colors.accent,
  },
  speedText: {
    color: '#fff',
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  speedTextOn: {
    fontFamily: fonts.bold,
  },
  seek: {
    height: 22,
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  seekCompact: {
    height: 14,
    marginHorizontal: 6,
  },
  seekRail: {
    position: 'relative',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  seekRailCompact: {
    height: 3,
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
  },
  knob: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: '#fff',
    top: 5,
  },
  knobCompact: {
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
    top: 3,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  spacer: {
    flex: 1,
  },
  time: {
    color: '#fff',
    fontFamily: fonts.medium,
    fontSize: 12,
    marginHorizontal: 4,
  },
  timeCompact: {
    fontSize: 10,
    marginHorizontal: 2,
  },
  timeDim: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: fonts.regular,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnLarge: {
    width: 42,
    height: 42,
  },
  iconBtnCompact: {
    width: 26,
    height: 26,
  },
  iconBtnLargeCompact: {
    width: 28,
    height: 28,
  },
  rateBtn: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateBtnCompact: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 3,
    borderRadius: 6,
  },
  rateBtnOn: {
    backgroundColor: 'rgba(229,9,20,0.22)',
  },
  rateText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  rateTextCompact: {
    fontSize: 11,
  },
  rateTextOn: {
    color: colors.accent,
  },
  volumeSlot: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  volumePop: {
    position: 'absolute',
    bottom: 40,
    width: 44,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(12,14,18,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  volumePct: {
    color: '#fff',
    fontFamily: fonts.medium,
    fontSize: 11,
    marginBottom: 6,
  },
  volumeTrack: {
    height: 92,
    width: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  volumeRail: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  volumeFill: {
    width: '100%',
    backgroundColor: '#fff',
  },
  pressed: {
    opacity: 0.72,
  },
});
