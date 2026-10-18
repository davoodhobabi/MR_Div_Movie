import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFloatingTabBarPadding } from '../../lib/tabBarInset';
import { BrandLogo } from '../../components/BrandLogo';
import { Glass } from '../../components/Glass';
import { SupportGoalBar } from '../../components/SupportGoalBar';
import { TvPressable } from '../../components/TvPressable';
import { strings } from '../../constants/strings';
import { colors, fonts, radii, spacing } from '../../constants/theme';
import { useCatalog } from '../../context/CatalogContext';
import { GlassScreen } from '../../context/GlassContext';
import { fetchDonitoGoal, type DonitoGoal } from '../../lib/donito';
import { useLayout } from '../../lib/layout';
import { ltrProps, ltrStyle } from '../../lib/rtl';

function DownloadCard({
  icon,
  title,
  hint,
  url,
  a11y,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  url: string;
  a11y: string;
}) {
  return (
    <TvPressable
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel={a11y}
    >
      <Glass {...ltrProps} style={[styles.channelCard, ltrStyle]}>
        <View style={styles.channelIcon}>
          <Ionicons name={icon} size={18} color={colors.text} />
        </View>
        <View style={styles.channelCopy}>
          <Text style={styles.channelTitle}>{title}</Text>
          <Text style={styles.channelHint}>{hint}</Text>
        </View>
        <Ionicons name="download-outline" size={16} color={colors.textMuted} />
      </Glass>
    </TvPressable>
  );
}

export default function SettingsScreen() {
  const { count } = useCatalog();
  const tabBarPad = useFloatingTabBarPadding();
  const { isTablet, gutter } = useLayout();
  const [goal, setGoal] = useState<DonitoGoal | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDonitoGoal().then((next) => {
      if (!cancelled) setGoal(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GlassScreen captureTabBarBlur>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarPad, paddingHorizontal: gutter },
            isTablet && styles.contentWide,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <BrandLogo size="sm" />
            <Text style={styles.pageTitle}>{strings.settingsPageTitle}</Text>
            <Text style={styles.count}>
              {strings.catalogReady(count.toLocaleString('fa-IR'))}
            </Text>
          </View>

          <TvPressable
            onPress={() => Linking.openURL(strings.telegramChannelUrl)}
            style={({ pressed }) => [pressed && styles.pressed]}
            accessibilityRole="link"
            accessibilityLabel={strings.telegramChannelA11y}
          >
            <Glass {...ltrProps} style={[styles.channelCard, ltrStyle]}>
              <View style={styles.channelIcon}>
                <Ionicons name="paper-plane" size={18} color={colors.text} />
              </View>
              <View style={styles.channelCopy}>
                <Text style={styles.channelTitle}>{strings.telegramChannelTitle}</Text>
                <Text style={styles.channelId}>{strings.telegramChannel}</Text>
                <Text style={styles.channelHint}>{strings.telegramChannelHint}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
            </Glass>
          </TvPressable>

          {Platform.OS === 'web' ? (
            <View style={styles.downloadBlock}>
              <Text style={styles.downloadHeading}>{strings.downloadAppsHeading}</Text>
              <DownloadCard
                icon="tv-outline"
                title={strings.downloadAndroidTvTitle}
                hint={strings.downloadAndroidTvHint}
                url={strings.downloadAndroidTvUrl}
                a11y={strings.downloadAndroidTvA11y}
              />
            </View>
          ) : null}

          {goal ? (
            <TvPressable
              onPress={() => Linking.openURL(strings.supportMrDivUrl)}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="link"
              accessibilityLabel={strings.supportMrDiv}
            >
              <Glass style={styles.goalCard}>
                <SupportGoalBar goal={goal} />
                <View style={styles.supportRow}>
                  <Ionicons name="heart" size={16} color={colors.accent} />
                  <Text style={styles.supportText}>{strings.supportMrDiv}</Text>
                  <Ionicons name="open-outline" size={14} color={colors.textMuted} />
                </View>
              </Glass>
            </TvPressable>
          ) : (
            <TvPressable
              onPress={() => Linking.openURL(strings.supportMrDivUrl)}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="link"
              accessibilityLabel={strings.supportMrDiv}
            >
              <Glass style={styles.supportRow}>
                <Ionicons name="heart" size={16} color={colors.accent} />
                <Text style={styles.supportText}>{strings.supportMrDiv}</Text>
                <Ionicons name="open-outline" size={14} color={colors.textMuted} />
              </Glass>
            </TvPressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    gap: spacing.lg,
  },
  contentWide: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
  },
  brand: {
    alignItems: 'center',
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.bold,
  },
  count: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  pressed: {
    opacity: 0.85,
  },
  channelCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.card,
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelCopy: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  channelTitle: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.bold,
    textAlign: 'right',
    width: '100%',
  },
  channelId: {
    color: colors.gold,
    fontSize: 14,
    fontFamily: fonts.medium,
    textAlign: 'right',
    width: '100%',
  },
  channelHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'right',
    width: '100%',
  },
  downloadBlock: {
    gap: spacing.sm,
  },
  downloadHeading: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.medium,
    textAlign: 'right',
    paddingHorizontal: 4,
  },
  goalCard: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radii.card,
    gap: spacing.md,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: radii.button,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(229, 9, 20, 0.45)',
    paddingHorizontal: 16,
  },
  supportText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
});
