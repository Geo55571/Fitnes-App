import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { getExercise } from '@/domain/exercises';
import { metricTitle } from '@/domain/describe';
import { dayTotal, matchingGoal } from '@/domain/metrics';
import type { DayKey, Goal, Session, TrackerConfig } from '@/domain/types';
import { formatMetric, formatProgress, isComplete, type UnitPrefs } from '@/domain/units';
import { colors, radius, tabular } from '@/theme';

import { exerciseIconColor, Icon } from './Icon';

interface Props {
  tracker: TrackerConfig;
  sessions: Session[];
  goals: Goal[];
  today: DayKey;
  prefs: UnitPrefs;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  floating?: boolean;
  /** Narrow screens: drop the chevron to keep the label readable. */
  compact?: boolean;
}

/** Compact today-total for one exercise; shows "value / target" when a goal is active today. */
export function TrackerCard({ tracker, sessions, goals, today, prefs, onPress, style, floating, compact }: Props) {
  const ex = getExercise(tracker.exerciseId);
  const value = dayTotal(sessions, today, tracker.exerciseId, tracker.metric);
  const goal = matchingGoal(goals, today, tracker.exerciseId, tracker.metric);

  let main: string;
  let target: string | null = null;
  let unit: string;
  if (goal?.target) {
    const p = formatProgress(value, goal.target, tracker.metric, prefs);
    main = p.value;
    target = p.target;
    unit = tracker.metric === 'reps' || tracker.metric === 'sets' ? '' : p.unit;
  } else {
    const f = formatMetric(value, tracker.metric, prefs);
    main = f.value;
    unit = f.unit;
  }
  const done = goal?.target ? isComplete(value, goal.target) : false;
  const label = metricTitle(tracker.exerciseId, tracker.metric);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${main}${target ? ` of ${target}` : ''} ${unit} today`}
      style={({ pressed }) => [styles.card, floating && styles.floating, pressed && styles.pressed, style]}>
      <Icon name={ex.icon} size={floating ? 24 : 26} color={exerciseIconColor(ex.id)} />
      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.value, tabular]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {main}
          {target ? <Text style={styles.target}> / {target}</Text> : null}
          {unit ? <Text style={styles.unit}> {unit}</Text> : null}
        </Text>
      </View>
      {done ? (
        <Icon name="check-circle" size={16} color={colors.primary} />
      ) : compact ? null : (
        <Icon name="chevron-right" size={18} color={colors.textTertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 64,
  },
  floating: {
    borderColor: 'rgba(230,227,220,0.9)',
    boxShadow: '0 3px 10px rgba(0,0,0,0.06)',
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 12.5, color: colors.textSecondary },
  value: { fontSize: 18, fontWeight: '600', color: colors.text, letterSpacing: -0.3, marginTop: 1 },
  target: { fontWeight: '400', color: colors.text },
  unit: { fontSize: 14, fontWeight: '400', color: colors.text },
});
