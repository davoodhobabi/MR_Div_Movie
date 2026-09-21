import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { EDITION_LABELS } from '../lib/catalog/editionLabels';
import type { CatalogEdition } from '../lib/catalog/types';
import { ltrProps, ltrStyle } from '../lib/rtl';
import { Glass } from './Glass';

const EDITION_COLOR: Record<CatalogEdition, string> = {
  SoftSub: colors.softSub,
  Dubbed: colors.dubbed,
  NoSub: colors.noSub,
};

type EditionDividerProps = {
  edition: CatalogEdition;
};

export function EditionDivider({ edition }: EditionDividerProps) {
  const color = EDITION_COLOR[edition];

  return (
    <View style={styles.row}>
      <View style={[styles.line, { backgroundColor: `${color}40` }]} />
      <Glass
        {...ltrProps}
        style={[styles.badge, ltrStyle, { borderColor: `${color}66` }]}
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, { color }]}>{EDITION_LABELS[edition]}</Text>
      </Glass>
      <View style={[styles.line, { backgroundColor: `${color}40` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  line: {
    flex: 1,
    height: 1,
    borderRadius: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.bold,
  },
});
