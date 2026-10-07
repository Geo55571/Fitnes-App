import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getExercise } from '@/domain/exercises';
import { goalTitle, metricTitle, scheduleLabel } from '@/domain/describe';
import type { GoalProgress } from '@/domain/metrics';
import { formatProgress, type UnitPrefs } from '@/domain/units';
import { colors, space, tabular, type } from '@/theme';

import { exerciseIconColor, Icon } from './Icon';
import { ProgressBar } from './ui';

interface Props {
  item: GoalProgress;
  prefs: UnitPrefs;
  onPress?: () => void;
  onToggle?: () => void;
  /** Read-only for days that are not today (to-dos in the past/future can still be viewed). */
  showSchedule?: boolean;
  disabled?: boolean;
}

export function GoalRow({ item, prefs, onPress, onToggle, showSchedule, disabled }: Props) {
  const { goal } = item;

  if (goal.kind === 'todo') {
    return (
      <Pressable
        onPress={disabled ? undefined : onToggle}
        onLongPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Icon name={item.done ? 'check-circle' : 'circle-outline'} size={24} color={item.done ? colors.primary : colors.textTertiary} />
        <View style={styles.body}>
          <Text style={[type.body, item.done && styles.doneText]} numberOfLines={2}>
            {goal.title}
          </Text>
          {showSchedule ? <Text style={type.caption}>{scheduleLabel(goal.schedule)}</Text> : null}
        </View>
        {onPress ? (
          <Pressable onPress={onPress} hitSlop={10} accessibilityLabel="Edit goal" accessibilityRole="button">
            <Icon name="chevron-right" size={20} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </Pressable>
    );
  }

  const ex = getExercise(goal.exerciseId);
  const p = formatProgress(item.value, item.target, goal.metric!, prefs);
  const unit = goal.metric === 'reps' || goal.metric === 'sets' ? '' : ` ${p.unit}`;
  const title = goal.title?.trim() ? goalTitle(goal, prefs) : metricTitle(ex.id, goal.metric);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${p.value} of ${p.target}${unit}${item.done ? ', complete' : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Icon name={ex.icon} size={24} color={exerciseIconColor(ex.id)} />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={[type.body, styles.title]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.value, tabular]}>
            <Text style={styles.strong}>{p.value}</Text> / {p.target}
            {unit}
          </Text>
        </View>
        <ProgressBar fraction={item.fraction} done={item.done} style={styles.bar} />
        {showSchedule ? <Text style={[type.caption, styles.sched]}>{scheduleLabel(goal.schedule)}</Text> : null}
      </View>
      {item.done ? (
        <Icon name="check-circle" size={20} color={colors.primary} />
      ) : onPress ? (
        <Icon name="chevron-right" size={20} color={colors.textTertiary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12 },
  pressed: { opacity: 0.7 },
  body: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  title: { flexShrink: 1 },
  value: { fontSize: 15, color: colors.textSecondary },
  strong: { fontWeight: '600', color: colors.text, fontSize: 16 },
  bar: { marginTop: 8 },
  sched: { marginTop: 4 },
  doneText: { color: colors.textSecondary },
});
