import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { fetchDonitoGoal, type DonitoGoal } from '../lib/donito';
import { glassBorder } from './Glass';
import { SupportGoalBar } from './SupportGoalBar';

type SupportReminderModalProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function SupportReminderModal({
  visible,
  onDismiss,
}: SupportReminderModalProps) {
  const [goal, setGoal] = useState<DonitoGoal | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void fetchDonitoGoal().then((next) => {
      if (!cancelled) setGoal(next);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const openSupport = () => {
    void Linking.openURL(strings.supportMrDivUrl);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="heart" size={22} color={colors.accent} />
          </View>
          <Text style={styles.title}>{strings.supportReminderTitle}</Text>
          <Text style={styles.body}>
            {goal?.description ?? strings.supportReminderBody}
          </Text>
          {goal ? <SupportGoalBar goal={goal} /> : null}
          <Pressable
            onPress={openSupport}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            accessibilityRole="link"
            accessibilityLabel={strings.supportMrDiv}
          >
            <Ionicons name="heart" size={16} color={colors.accent} />
            <Text style={styles.primaryText}>{strings.supportMrDiv}</Text>
            <Ionicons name="open-outline" size={14} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={strings.supportReminderLater}
          >
            <Text style={styles.later}>{strings.supportReminderLater}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 8, 12, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    borderRadius: radii.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glassBorder,
    backgroundColor: colors.surfaceElevated,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.bold,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 24,
    writingDirection: 'rtl',
  },
  primary: {
    alignSelf: 'stretch',
    minHeight: 48,
    marginTop: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(229, 9, 20, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.medium,
  },
  later: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.medium,
    textAlign: 'center',
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.85,
  },
});
