import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onActivity = () => revealRef.current();
    node.addEventListener('pointermove', onActivity);
    node.addEventListener('pointerdown', onActivity);
    armHide();
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
    const root = rootRef.current as unknown as HTMLElement | null;
    const video = root?.parentElement?.querySelector('video') ?? null;
    if (!video) return;
    let cancelled = false;
    const place = (lift: boolean) => {
      if (cancelled) return;
      if (!lift) {
        placeWebSubtitles(video, null);
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
      if (shownRef.current) place(true);
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
      if (shownRef.current) place(true);
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
  const [nudge, setNudge] = useState<'back' | 'forward' | null>(null);
  if (Math.abs(currentTime - anchorRef.current) < 1.5) {
    anchorRef.current = currentTime;
  }

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

  const zoneFromEvent = (event: GestureResponderEvent) => {
    const node = rootRef.current as unknown as HTMLElement | null;
    const box = node?.getBoundingClientRect?.();
    const pageX = event.nativeEvent.pageX;
    const x =
      box && typeof pageX === 'number'
        ? pageX - box.left
        : event.nativeEvent.locationX;
    const ratio = x / (box?.width || 1);
    if (ratio < 0.38) return 'left' as const;
    if (ratio > 0.62) return 'right' as const;
    return 'center' as const;
  };

  const onSurfacePress = (event: GestureResponderEvent) => {
    const zone = zoneFromEvent(event);
    const touch =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches &&
      window.matchMedia('(hover: none)').matches;
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
    singleTapTimer.current = setTimeout(() => onSurface(), 280);
  };

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
      <Pressable
        style={styles.catcher}
        onPress={onSurfacePress}
        accessibilityRole="button"
        accessibilityLabel={playing ? strings.playerPauseLabel : strings.playerPlayLabel}
      />
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
      <Animated.View
        pointerEvents={shown ? 'box-none' : 'none'}
        style={[styles.fade, { opacity, transform: [{ translateY: shift }] }]}
      >
        {!playing ? (
          <View style={styles.centerWrap} pointerEvents="box-none">
            <Pressable
              onPress={onTogglePlay}
              accessibilityRole="button"
              accessibilityLabel={strings.playerPlayLabel}
              style={({ pressed }) => [styles.centerPlay, pressed && styles.pressed]}
            >
              <Ionicons name="play" size={34} color="#fff" style={styles.playNudge} />
            </Pressable>
          </View>
        ) : null}

        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.82)']}
          locations={[0, 0.42, 1]}
          style={styles.shade}
          pointerEvents="box-none"
        >
          <View ref={dockRef} pointerEvents="box-none">
          {menu === 'audio' || menu === 'subs' || menu === 'speed' ? (
            <View style={styles.sheet}>
              {menu === 'speed' ? (
                <View style={styles.speedRow}>
                  {SPEEDS.map((value) => (
                    <Pressable
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
                    </Pressable>
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

          <View style={styles.bar}>
          <SeekBar
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
              onPress={onTogglePlay}
            />
            <Text style={styles.time}>
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
                onPress={() => toggleMenu('volume')}
              />
            </View>
            <IconButton
              icon="headset"
              label={strings.playerChangeAudio}
              active={menu === 'audio'}
              onPress={() => toggleMenu('audio')}
            />
            <IconButton
              icon="text"
              label={strings.playerChangeSubtitle}
              active={menu === 'subs' || subtitleId != null}
              onPress={() => toggleMenu('subs')}
            />
            <Pressable
              onPress={() => toggleMenu('speed')}
              accessibilityRole="button"
              accessibilityLabel={strings.playerSpeedLabel(rate)}
              style={({ pressed }) => [
                styles.rateBtn,
                (menu === 'speed' || rate !== 1) && styles.rateBtnOn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.rateText, rate !== 1 && styles.rateTextOn]}>
                {faNum(rate)}×
              </Text>
            </Pressable>
            <IconButton
              icon={fullscreen ? 'contract' : 'expand'}
              label={fullscreen ? strings.playerExitFullscreen : strings.playerFullscreenLabel}
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

function IconButton({
  icon,
  label,
  onPress,
  active,
  large,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  large?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, large && styles.iconBtnLarge, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={large ? 26 : 22} color={active ? colors.accent : '#fff'} />
    </Pressable>
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
    >
      <Text style={[styles.sheetText, selected && styles.sheetTextOn]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : <View style={styles.checkSpacer} />}
    </Pressable>
  );
}

function SeekBar({
  progress,
  duration,
  onSeek,
  onDragStart,
  onDragEnd,
}: {
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const ref = useRef<View>(null);
  const seekAt = (pageX: number) => {
    const node = ref.current as unknown as HTMLElement | null;
    const box = node?.getBoundingClientRect?.();
    if (!box || box.width <= 0 || duration <= 0) return;
    const ratio = Math.min(1, Math.max(0, (pageX - box.left) / box.width));
    onSeek(ratio * duration);
  };
  const fromEvent = (event: GestureResponderEvent) => {
    seekAt(event.nativeEvent.pageX);
  };
  return (
    <View
      ref={ref}
      {...ltrProps}
      style={styles.seek}
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
      <View style={styles.seekRail}>
        <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={[styles.knob, { left: `${progress * 100}%` }]} />
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
  const ref = useRef<View>(null);
  const at = (pageY: number) => {
    const node = ref.current as unknown as HTMLElement | null;
    const box = node?.getBoundingClientRect?.();
    if (!box || box.height <= 0) return;
    const ratio = 1 - (pageY - box.top) / box.height;
    onChange(Math.min(1, Math.max(0, ratio)));
  };
  return (
    <View style={styles.volumePop}>
      <Text style={styles.volumePct}>{faNum(Math.round(value * 100))}</Text>
      <View
        ref={ref}
        style={styles.volumeTrack}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => at(event.nativeEvent.pageY)}
        onResponderMove={(event) => at(event.nativeEvent.pageY)}
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
  playNudge: {
    marginLeft: 4,
  },
  shade: {
    paddingTop: 48,
    paddingBottom: 10,
    paddingHorizontal: 10,
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
  seekRail: {
    position: 'relative',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
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
  rateBtn: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateBtnOn: {
    backgroundColor: 'rgba(229,9,20,0.22)',
  },
  rateText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 13,
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
