import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { formatFileSizeLabel, formatQualityLabel } from '../lib/catalog/qualityLabel';
import type { CatalogEdition, CatalogSource } from '../lib/catalog/types';
import { ltrProps, ltrStyle } from '../lib/rtl';
import { useTvFocus } from '../lib/tv';
import { Glass } from './Glass';

const EDITION_COLOR: Record<CatalogEdition, string> = {
  SoftSub: colors.softSub,
  Dubbed: colors.dubbed,
  NoSub: colors.noSub,
};

type SourceButtonProps = {
  source: CatalogSource;
  onPlay: () => void;
  onDownload: () => void;
  active?: boolean;
};

export function SourceButton({
  source,
  onPlay,
  onDownload,
  active = false,
}: SourceButtonProps) {
  const accent = EDITION_COLOR[source.edition];
  const ready = source.url.trim().length > 0;
  const qualityLabel = formatQualityLabel(source.title);
  const sizeLabel = source.size.trim()
    ? formatFileSizeLabel(source.size)
    : strings.sizeUnknown;
  const playFocus = useTvFocus();
  const downloadFocus = useTvFocus();

  return (
    <Glass
      {...ltrProps}
      style={[
        styles.button,
        ltrStyle,
        { borderColor: active ? accent : `${accent}55` },
        !ready && styles.pending,
      ]}
    >
      <View style={styles.actions}>
        <Pressable
          onPress={ready ? onPlay : undefined}
          disabled={!ready}
          {...playFocus.props}
          accessibilityRole="button"
          accessibilityState={{ selected: active, disabled: !ready }}
          accessibilityLabel={`${strings.tapToPlay} · ${qualityLabel}`}
          style={({ pressed }) => [
            styles.iconWrap,
            { backgroundColor: `${accent}22` },
            pressed && ready && styles.pressed,
            playFocus.style,
          ]}
        >
          <Ionicons
            name={active ? 'pause' : 'play'}
            size={18}
            color={accent}
          />
        </Pressable>
        <Pressable
          onPress={ready ? onDownload : undefined}
          disabled={!ready}
          {...downloadFocus.props}
          accessibilityRole="button"
          accessibilityLabel={`${strings.downloadFile} · ${qualityLabel}`}
          style={({ pressed }) => [
            styles.iconWrap,
            { backgroundColor: `${accent}22` },
            pressed && ready && styles.pressed,
            downloadFocus.style,
          ]}
        >
          <Ionicons name="download-outline" size={18} color={accent} />
        </Pressable>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {qualityLabel}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {sizeLabel}
        </Text>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.button,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  pending: {
    opacity: 0.9,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
    paddingVertical: 4,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.medium,
    textAlign: 'right',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'right',
  },
});
