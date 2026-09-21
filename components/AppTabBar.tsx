import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useContext, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { TabBarBlurTargetContext } from '../context/GlassContext';
import { useLayout } from '../lib/layout';
import { ltrProps, ltrStyle } from '../lib/rtl';

type TabRoute = { key: string; name: string };

type TabBarProps = {
  state: {
    index: number;
    routes: TabRoute[];
  };
  navigation: {
    emit: (event: {
      type: string;
      target: string;
      canPreventDefault?: boolean;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  insets: { top: number; bottom: number; left: number; right: number };
};

const TAB_META: Record<
  string,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconOn: keyof typeof Ionicons.glyphMap;
  }
> = {
  favorites: {
    label: strings.tabFavorites,
    icon: 'heart-outline',
    iconOn: 'heart',
  },
  movies: {
    label: strings.tabMovies,
    icon: 'film-outline',
    iconOn: 'film',
  },
  index: {
    label: strings.tabHome,
    icon: 'home-outline',
    iconOn: 'home',
  },
  series: {
    label: strings.tabSeries,
    icon: 'tv-outline',
    iconOn: 'tv',
  },
  settings: {
    label: strings.tabSettings,
    icon: 'information-circle-outline',
    iconOn: 'information-circle',
  },
};

function BottomGlow({ width, height, id }: { width: number; height: number; id: string }) {
  if (width <= 0 || height <= 0) return null;

  return (
    <Svg width={width} height={height} style={styles.itemGlow} pointerEvents="none">
      <Defs>
        <RadialGradient
          id={id}
          cx={width / 2}
          cy={height}
          rx={Math.min(width * 0.72, 42)}
          ry={height * 0.92}
          fx={width / 2}
          fy={height}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#E50914" stopOpacity="0.25" />
          <Stop offset="0.42" stopColor="#E50914" stopOpacity="0.11" />
          <Stop offset="1" stopColor="#E50914" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

export function AppTabBar({ state, navigation, insets }: TabBarProps) {
  const tabBarBlur = useContext(TabBarBlurTargetContext);
  const { isTablet, gutter } = useLayout();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        {
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + spacing.lg,
        },
      ]}
    >
      <BlurView
        key={tabBarBlur?.target ? 'blur-ready' : 'blur-wait'}
        pointerEvents="box-none"
        intensity={80}
        tint="dark"
        blurMethod="dimezisBlurView"
        blurReductionFactor={2}
        blurTarget={tabBarBlur?.target ?? undefined}
        style={[styles.bar, isTablet && styles.barWide]}
      >
        <View pointerEvents="none" style={styles.tint} />
        <View {...ltrProps} style={[styles.row, ltrStyle]}>
          {state.routes.map((route, index) => {
            const meta = TAB_META[route.name];
            if (!meta) return null;
            const focused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TabItem
                key={route.key}
                glowId={`tabGlow-${route.key}`}
                focused={focused}
                label={meta.label}
                icon={focused ? meta.iconOn : meta.icon}
                onPress={onPress}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

function TabItem({
  glowId,
  focused,
  label,
  icon,
  onPress,
}: {
  glowId: string;
  focused: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <Pressable
      onPress={onPress}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) {
          setSize({ width, height });
        }
      }}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
    >
      {focused ? (
        <BottomGlow id={glowId} width={size.width} height={size.height} />
      ) : null}
      <View style={styles.iconSlot}>
        <Ionicons
          name={icon}
          size={22}
          color={focused ? colors.text : colors.textDim}
        />
      </View>
      <Text
        style={[styles.label, focused && styles.labelOn]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    elevation: 0,
    backgroundColor: 'transparent',
  },
  bar: {
    overflow: 'hidden',
    borderRadius: radii.search,
    backgroundColor: 'transparent',
  },
  barWide: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 10, 16, 0.4)',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 8,
  },
  item: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingTop: 8,
    paddingBottom: 8,
  },
  itemPressed: {
    opacity: 0.78,
  },
  itemGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  iconSlot: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    maxWidth: '100%',
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  labelOn: {
    color: colors.text,
    fontFamily: fonts.bold,
  },
});
