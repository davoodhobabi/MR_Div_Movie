import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { Glass } from './Glass';

type HomeCarouselProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onSeeAll?: () => void;
  children: ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
};

export function HomeCarousel({
  title,
  icon,
  iconColor = colors.accent,
  onSeeAll,
  children,
  empty = false,
  emptyTitle,
  emptyHint,
}: HomeCarouselProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name={icon} size={16} color={iconColor} />
          <Text style={styles.title}>{title}</Text>
        </View>
        {onSeeAll ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={8}
            style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={strings.seeAll}
          >
            <Text style={styles.seeAllText}>{strings.seeAll}</Text>
            <Ionicons name="chevron-back" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {empty ? (
        <Glass style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name={icon} size={22} color={iconColor} />
          </View>
          {emptyTitle ? <Text style={styles.emptyTitle}>{emptyTitle}</Text> : null}
          {emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null}
        </Glass>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.track}
          style={styles.scroller}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  header: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  pressed: {
    opacity: 0.75,
  },
  scroller: {
    direction: 'ltr',
  },
  track: {
    flexDirection: 'row-reverse',
    paddingHorizontal: spacing.lg,
    gap: 12,
  },
  empty: {
    marginHorizontal: spacing.lg,
    borderRadius: radii.card,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
});
