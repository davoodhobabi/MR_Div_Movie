import { StyleSheet, Text, View } from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii } from '../constants/theme';
import { formatToman, type DonitoGoal } from '../lib/donito';

export function SupportGoalBar({ goal }: { goal: DonitoGoal }) {
  const ratio =
    goal.goalAmount > 0 ? Math.min(1, goal.filledAmount / goal.goalAmount) : 0;
  const percent = Math.round(ratio * 100).toLocaleString('fa-IR');

  return (
    <View style={styles.goal}>
      <Text style={styles.goalTitle}>{goal.title}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(ratio * 100, 4)}%` }]} />
      </View>
      <View style={styles.goalMeta}>
        <Text style={styles.goalPercent}>{percent}٪</Text>
        <Text style={styles.goalAmount}>
          {strings.supportGoalProgress(
            formatToman(goal.filledAmount),
            formatToman(goal.goalAmount),
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  goal: {
    alignSelf: 'stretch',
    direction: 'ltr',
    gap: 8,
  },
  goalTitle: {
    width: '100%',
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.medium,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  track: {
    width: '100%',
    height: 10,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  goalMeta: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  goalAmount: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  goalPercent: {
    color: colors.gold,
    fontSize: 12,
    fontFamily: fonts.bold,
    textAlign: 'left',
  },
});
