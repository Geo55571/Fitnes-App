import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { confirmAction } from '@/components/confirm';
import { exerciseIconColor, Icon } from '@/components/Icon';
import { goBack } from '@/components/nav';
import { showToast } from '@/components/toast';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Field,
  IconButton,
  Notice,
  Screen,
  Segmented,
  Sheet,
  StackHeader,
} from '@/components/ui';
import { addDays, formatRelativeDay, WEEKDAY_LETTER } from '@/domain/dates';
import {
  CATEGORY_LABEL,
  defaultMetric,
  exercisesIn,
  getExercise,
  METRIC_LABEL,
  metricsFor,
} from '@/domain/exercises';
import { defaultStep } from '@/domain/goals';
import type { Category, Goal, Metric, Schedule } from '@/domain/types';
import {
  distanceToMeters,
  kgToWeight,
  metersToDistance,
  parseDecimal,
  parseInteger,
  trimNumber,
  weightToKg,
  type UnitPrefs,
} from '@/domain/units';
import { useToday, useUnits } from '@/hooks/today';
import type { GoalInput } from '@/store/store';
import { useStore } from '@/store/store';
import { colors, radius, space, type } from '@/theme';

type ScheduleKind = Schedule['type'];

function targetToText(value: number | undefined, metric: Metric, prefs: UnitPrefs): { main: string; sec: string } {
  if (value === undefined) return { main: '', sec: '' };
  switch (metric) {
    case 'distance':
      return { main: trimNumber(metersToDistance(value, prefs.distanceUnit), 2), sec: '' };
    case 'volume':
      return { main: trimNumber(kgToWeight(value, prefs.weightUnit), 0), sec: '' };
    case 'duration':
      return { main: String(Math.floor(value / 60)), sec: String(Math.round(value % 60)) };
    default:
      return { main: String(value), sec: '' };
  }
}

function textToTarget(main: string, sec: string, metric: Metric, prefs: UnitPrefs): number {
  switch (metric) {
    case 'distance': {
      const v = parseDecimal(main);
      return v > 0 ? distanceToMeters(v, prefs.distanceUnit) : NaN;
    }
    case 'volume': {
      const v = parseDecimal(main);
      return v > 0 ? weightToKg(v, prefs.weightUnit) : NaN;
    }
    case 'duration': {
      const m = main.trim() ? parseInteger(main) : 0;
      const s = sec.trim() ? parseInteger(sec) : 0;
      if (Number.isNaN(m) || Number.isNaN(s) || s > 59) return NaN;
      return m * 60 + s > 0 ? m * 60 + s : NaN;
    }
    default: {
      const v = parseInteger(main);
      return v > 0 ? v : NaN;
    }
  }
}

/** Step for "raise automatically": seconds for time, display units otherwise. */
function stepToText(step: number, metric: Metric, prefs: UnitPrefs): string {
  if (metric === 'duration') return String(Math.round(step));
  return targetToText(step, metric, prefs).main;
}

function textToStep(text: string, metric: Metric, prefs: UnitPrefs): number {
  if (metric === 'duration') {
    const v = parseInteger(text);
    return v > 0 ? v : NaN;
  }
  return textToTarget(text, '', metric, prefs);
}

export default function GoalEditor() {
  const { id, date: dateParam } = useLocalSearchParams<{ id: string; date?: string }>();
  const today = useToday();
  const prefs = useUnits();
  const { goals, addGoal, updateGoal, deleteGoal } = useStore(
    useShallow((s) => ({ goals: s.goals, addGoal: s.addGoal, updateGoal: s.updateGoal, deleteGoal: s.deleteGoal })),
  );
  const existing = id === 'new' ? undefined : goals.find((g) => g.id === id);
  const isNew = id === 'new';

  const [kind, setKind] = useState<Goal['kind']>(existing?.kind ?? 'metric');
  const [exerciseId, setExerciseId] = useState(existing?.exerciseId ?? 'pushups');
  const [metric, setMetric] = useState<Metric>(existing?.metric ?? 'reps');
  const initialTarget = targetToText(existing?.target, existing?.metric ?? 'reps', prefs);
  const [targetMain, setTargetMain] = useState(isNew ? '10' : initialTarget.main);
  const [targetSec, setTargetSec] = useState(initialTarget.sec);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [schedKind, setSchedKind] = useState<ScheduleKind>(existing?.schedule.type ?? 'daily');
  const [days, setDays] = useState<number[]>(existing?.schedule.type === 'weekdays' ? existing.schedule.days : [1, 3, 5]);
  const [onceDate, setOnceDate] = useState(
    existing?.schedule.type === 'once' ? existing.schedule.date : dateParam && dateParam >= today ? dateParam : today,
  );
  const [autoOn, setAutoOn] = useState(!!existing?.autoIncrease);
  const [stepText, setStepText] = useState(
    existing?.autoIncrease ? stepToText(existing.autoIncrease.step, existing.metric ?? 'reps', prefs) : '',
  );
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isNew && !existing) {
    return (
      <Screen header={<StackHeader title="Goal" />}>
        <EmptyState icon="flag-checkered" title="Goal not found" />
      </Screen>
    );
  }

  const ex = getExercise(exerciseId);
  const retired = !!existing?.endDate && existing.endDate < today;
  const hasHistory = !!existing && existing.startDate < today;

  const chooseExercise = (idNext: string) => {
    const next = getExercise(idNext);
    setExerciseId(idNext);
    if (!metricsFor(next.kind).includes(metric)) changeMetric(defaultMetric(next.kind));
    setPicker(false);
  };

  const changeMetric = (m: Metric) => {
    setMetric(m);
    const defaults: Record<Metric, [string, string]> = {
      reps: ['10', ''],
      sets: ['3', ''],
      volume: [prefs.weightUnit === 'kg' ? '1000' : '2200', ''],
      distance: [prefs.distanceUnit === 'km' ? '5' : '3', ''],
      duration: ['1', '0'],
    };
    setTargetMain(defaults[m][0]);
    setTargetSec(defaults[m][1]);
    setStepText('');
  };

  const toggleAuto = (on: boolean) => {
    setAutoOn(on);
    if (on && !stepText) {
      const t = textToTarget(targetMain, targetSec, metric, prefs);
      setStepText(stepToText(defaultStep(metric, prefs, Number.isNaN(t) ? 0 : t), metric, prefs));
    }
  };

  const save = () => {
    let schedule: Schedule;
    if (schedKind === 'daily') schedule = { type: 'daily' };
    else if (schedKind === 'weekdays') {
      if (!days.length) return setError('Pick at least one day.');
      schedule = { type: 'weekdays', days: [...days].sort() };
    } else if (schedKind === 'weekly') schedule = { type: 'weekly' };
    else schedule = { type: 'once', date: onceDate };

    let input: GoalInput;
    if (kind === 'todo') {
      if (!title.trim()) return setError('Describe the to-do.');
      input = { kind, title: title.trim(), schedule };
    } else {
      const target = textToTarget(targetMain, targetSec, metric, prefs);
      if (Number.isNaN(target)) return setError('Enter a target greater than zero.');
      let autoIncrease: Goal['autoIncrease'];
      if (autoOn && schedKind !== 'once') {
        const step = textToStep(stepText, metric, prefs);
        if (Number.isNaN(step)) return setError('Enter how much to raise the target by.');
        autoIncrease = { step, checkedWeek: existing?.autoIncrease?.checkedWeek };
      }
      input = { kind, title: '', exerciseId, metric, target, schedule, autoIncrease };
    }
    setError(null);
    if (existing) {
      updateGoal(existing.id, input, today);
      showToast('Goal updated');
    } else {
      addGoal(input, today);
      showToast('Goal added');
    }
    goBack();
  };

  const remove = () => {
    if (!existing) return;
    confirmAction(
      'Remove goal?',
      hasHistory ? 'It stops from today. Past days keep their results.' : 'This goal will be deleted.',
      'Remove',
      () => {
        deleteGoal(existing.id, today);
        showToast('Goal removed');
        goBack();
      },
    );
  };

  const unitSuffix =
    metric === 'distance' ? prefs.distanceUnit : metric === 'volume' ? prefs.weightUnit : metric === 'reps' ? 'reps' : metric === 'sets' ? 'sets' : undefined;

  return (
    <Screen
      header={
        <StackHeader
          title={isNew ? 'New goal' : 'Edit goal'}
          right={existing && !retired ? <IconButton icon="trash-can-outline" label="Remove goal" color={colors.danger} onPress={remove} /> : undefined}
        />
      }
      footer={retired ? undefined : <Button label={isNew ? 'Add goal' : 'Save goal'} onPress={save} />}>
      {retired && (
        <View style={styles.noticeTop}>
          <Notice icon="calendar-blank-outline">This goal ended on {formatRelativeDay(existing!.endDate!, today)}. It stays in your history.</Notice>
        </View>
      )}

      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'metric', label: 'Exercise target', icon: 'flag-checkered' },
          { value: 'todo', label: 'To-do', icon: 'check-circle' },
        ]}
      />

      {kind === 'metric' ? (
        <View>
          <Text style={styles.label}>Exercise</Text>
          <Pressable onPress={() => setPicker(true)} style={styles.select} accessibilityRole="button" accessibilityLabel={`Exercise: ${ex.name}`}>
            <Icon name={ex.icon} size={22} color={exerciseIconColor(ex.id)} />
            <Text style={[type.body, styles.flex]}>{ex.name}</Text>
            <Icon name="chevron-down" size={20} color={colors.textSecondary} />
          </Pressable>

          {metricsFor(ex.kind).length > 1 && (
            <>
              <Text style={styles.label}>Measure</Text>
              <ChipRow>
                {metricsFor(ex.kind).map((m) => (
                  <Chip key={m} label={METRIC_LABEL[m]} selected={metric === m} onPress={() => changeMetric(m)} />
                ))}
              </ChipRow>
            </>
          )}

          <Text style={styles.label}>{schedKind === 'weekly' ? 'Weekly target' : 'Daily target'}</Text>
          {metric === 'duration' ? (
            <View style={styles.row}>
              <Field value={targetMain} onChangeText={setTargetMain} keyboardType="number-pad" suffix="min" style={styles.flex} accessibilityLabel="Target minutes" />
              <Field value={targetSec} onChangeText={setTargetSec} keyboardType="number-pad" suffix="sec" style={styles.flex} accessibilityLabel="Target seconds" maxLength={2} />
            </View>
          ) : (
            <Field
              value={targetMain}
              onChangeText={setTargetMain}
              keyboardType={metric === 'distance' ? 'decimal-pad' : 'number-pad'}
              suffix={unitSuffix}
              accessibilityLabel="Target"
            />
          )}
          <Text style={[type.caption, styles.help]}>
            {schedKind === 'weekly'
              ? `Everything you log for ${ex.name.toLowerCase()} from Monday to Sunday adds up. Progress resets each Monday.`
              : `Everything you log for ${ex.name.toLowerCase()} on a day adds up toward this target. Progress resets at midnight.`}
          </Text>
        </View>
      ) : (
        <Field label="To-do" value={title} onChangeText={setTitle} placeholder="e.g. Stretch for 10 minutes" style={styles.todo} maxLength={80} />
      )}

      <Text style={styles.label}>Repeat</Text>
      <Segmented
        value={schedKind}
        onChange={setSchedKind}
        options={[
          { value: 'daily', label: 'Daily' },
          { value: 'weekdays', label: 'Some days' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'once', label: 'Once' },
        ]}
      />
      {schedKind === 'weekdays' && (
        <View style={styles.weekdays}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = days.includes(d);
            return (
              <Pressable
                key={d}
                onPress={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))}
                style={[styles.wd, on && styles.wdOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}>
                <Text style={[styles.wdText, on && styles.wdTextOn]}>{WEEKDAY_LETTER[d]}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {schedKind === 'once' && (
        <View style={styles.onceRow}>
          <IconButton icon="chevron-left" label="Earlier" onPress={() => onceDate > today && setOnceDate(addDays(onceDate, -1))} color={onceDate > today ? colors.text : colors.border} />
          <Text style={[type.bodyStrong, styles.onceText]}>{formatRelativeDay(onceDate, today)}</Text>
          <IconButton icon="chevron-right" label="Later" onPress={() => setOnceDate(addDays(onceDate, 1))} />
        </View>
      )}

      {kind === 'metric' && schedKind !== 'once' && (
        <View style={styles.autoCard}>
          <View style={styles.autoRow}>
            <View style={styles.flex}>
              <Text style={type.bodyStrong}>Raise automatically</Text>
              <Text style={type.small}>
                {schedKind === 'weekly'
                  ? 'After a week where you hit the total, the target goes up.'
                  : 'After a week where you hit it on at least 5 of 7 scheduled days, the target goes up.'}
              </Text>
            </View>
            <Switch
              value={autoOn}
              onValueChange={toggleAuto}
              trackColor={{ true: colors.primary, false: colors.track }}
              thumbColor="#fff"
              accessibilityLabel="Raise automatically"
            />
          </View>
          {autoOn && (
            <Field
              label="Raise by"
              value={stepText}
              onChangeText={setStepText}
              keyboardType={metric === 'distance' ? 'decimal-pad' : 'number-pad'}
              suffix={metric === 'duration' ? 'sec' : unitSuffix}
              style={styles.stepField}
            />
          )}
        </View>
      )}

      {hasHistory && !retired && (
        <View style={styles.notice}>
          <Notice icon="calendar-blank-outline">Changes apply from today. Earlier days keep the target they had.</Notice>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <Sheet visible={picker} onClose={() => setPicker(false)} title="Choose exercise">
        {(['bodyweight', 'cardio', 'strength'] as Category[]).map((c) => (
          <View key={c} style={styles.pickGroup}>
            <Text style={styles.pickHead}>{CATEGORY_LABEL[c]}</Text>
            {exercisesIn(c).map((e) => (
              <Pressable key={e.id} onPress={() => chooseExercise(e.id)} style={styles.pickRow} accessibilityRole="button">
                <Icon name={e.icon} size={22} color={exerciseIconColor(e.id)} />
                <Text style={[type.body, styles.flex]}>{e.name}</Text>
                {e.id === exerciseId && <Icon name="check-bold" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: space.xl, marginBottom: space.sm },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 54,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  help: { marginTop: space.sm },
  todo: { marginTop: space.xl },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  wd: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wdOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  wdText: { fontSize: 15, fontWeight: '600', color: colors.text },
  wdTextOn: { color: colors.onPrimary },
  onceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: space.sm, marginBottom: space.md },
  onceText: { minWidth: 120, textAlign: 'center' },
  notice: { marginTop: space.xl },
  autoCard: { marginTop: space.xl, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepField: { marginTop: space.md },
  noticeTop: { marginBottom: space.lg },
  error: { color: colors.danger, marginTop: space.md, textAlign: 'center' },
  pickGroup: { marginBottom: space.md },
  pickHead: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginVertical: space.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: 48, paddingHorizontal: space.xs },
});
