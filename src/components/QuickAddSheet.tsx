import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { describeEntry } from '@/domain/describe';
import { formatRelativeDay } from '@/domain/dates';
import { getExercise } from '@/domain/exercises';
import { dayTotal, matchingGoal } from '@/domain/metrics';
import type { Entry } from '@/domain/types';
import {
  distanceToMeters,
  formatDuration,
  formatMetricText,
  formatProgress,
  kgToWeight,
  parseDecimal,
  parseInteger,
  trimNumber,
  weightToKg,
} from '@/domain/units';
import { goalFeedback } from '@/hooks/saveFeedback';
import { useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { colors, radius, space, tabular, type } from '@/theme';

import { exerciseIconColor, Icon } from './Icon';
import { Stopwatch } from './timers';
import { showToast } from './toast';
import { Button, Chip, ChipRow, Field, IconButton, Sheet } from './ui';

function lastEntry(sessions: { performedAt: string; date: string; entries: Entry[] }[], exerciseId: string) {
  let best: { at: string; date: string; e: Entry } | undefined;
  for (const s of sessions) for (const e of s.entries) if (e.exerciseId === exerciseId && (!best || s.performedAt > best.at)) best = { at: s.performedAt, date: s.date, e };
  return best;
}

/** One-tap logging from a Today tracker. */
export function QuickAddSheet({ exerciseId, onClose }: { exerciseId: string | null; onClose: () => void }) {
  return (
    <Sheet visible={!!exerciseId} onClose={onClose} title={exerciseId ? getExercise(exerciseId).name : ''}>
      {exerciseId ? <QuickAddBody key={exerciseId} exerciseId={exerciseId} onDone={onClose} /> : null}
    </Sheet>
  );
}

function QuickAddBody({ exerciseId, onDone }: { exerciseId: string; onDone: () => void }) {
  const today = useToday();
  const prefs = useUnits();
  const { sessions, goals, addSession } = useStore(useShallow((s) => ({ sessions: s.sessions, goals: s.goals, addSession: s.addSession })));
  const ex = getExercise(exerciseId);
  const last = lastEntry(sessions, exerciseId);

  const lastReps = last?.e.sets?.length ? Math.max(...last.e.sets.map((x) => x.reps)) : 10;
  const [reps, setReps] = useState(lastReps);
  const [seconds, setSeconds] = useState(last?.e.durationSec ?? 60);
  const [distance, setDistance] = useState('');
  const [minutes, setMinutes] = useState('');
  const top = last?.e.sets?.reduce((a, b) => ((b.weightKg ?? 0) > (a.weightKg ?? 0) ? b : a), last.e.sets[0]);
  const [weight, setWeight] = useState(top?.weightKg !== undefined ? trimNumber(kgToWeight(top.weightKg, prefs.weightUnit), 2) : '');
  const [setReps2, setSetReps2] = useState(top ? String(top.reps) : '');
  const [error, setError] = useState<string | null>(null);

  const metric = ex.kind === 'reps' ? 'reps' : ex.kind === 'duration' ? 'duration' : ex.kind === 'distance' ? 'distance' : 'sets';
  const goal = matchingGoal(goals, today, exerciseId, metric);
  const value = dayTotal(sessions, today, exerciseId, metric);
  const status = goal?.target
    ? (() => {
        const p = formatProgress(value, goal.target, metric, prefs);
        return `Today ${p.value} / ${p.target}${metric === 'reps' || metric === 'sets' ? '' : ` ${p.unit}`}`;
      })()
    : `Today ${formatMetricText(value, metric, prefs)}`;

  const save = (entry: Omit<Entry, 'id'>) => {
    const input = { date: today, category: ex.category, entries: [entry] };
    addSession(input);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast(goalFeedback(input, today, prefs));
    onDone();
  };

  const go = (path: '/log' | '/progress') => {
    onDone();
    router.navigate({ pathname: path, params: path === '/log' ? { exercise: exerciseId, category: ex.category } : { exercise: exerciseId } });
  };

  return (
    <View style={styles.body}>
      <View style={styles.statusRow}>
        <Icon name={ex.icon} size={22} color={exerciseIconColor(ex.id)} />
        <Text style={[type.body, styles.flex]}>{status}</Text>
      </View>

      {ex.kind === 'reps' && (
        <>
          <View style={styles.stepper}>
            <IconButton icon="minus" label="One less" onPress={() => setReps((r) => Math.max(1, r - 1))} size={28} />
            <Text style={[styles.big, tabular]} accessibilityLiveRegion="polite">
              {reps}
            </Text>
            <IconButton icon="plus" label="One more" onPress={() => setReps((r) => r + 1)} size={28} />
          </View>
          <ChipRow>
            {[1, 5, 10, 20].map((n) => (
              <Chip key={n} label={`+${n}`} onPress={() => setReps((r) => r + n)} />
            ))}
            <Chip label="Reset" onPress={() => setReps(1)} />
          </ChipRow>
          <Button label={`Add ${reps} ${ex.name.toLowerCase()}`} onPress={() => save({ exerciseId, sets: [{ reps }] })} style={styles.cta} />
        </>
      )}

      {ex.kind === 'duration' && (
        <>
          <Stopwatch label="Hold" onStop={(sec) => setSeconds(sec)} />
          <ChipRow>
            {[30, 45, 60, 90, 120].map((s) => (
              <Chip key={s} label={formatDuration(s)} selected={seconds === s} onPress={() => setSeconds(s)} />
            ))}
          </ChipRow>
          <Button label={`Add ${formatDuration(seconds)} ${ex.name.toLowerCase()}`} onPress={() => save({ exerciseId, durationSec: seconds })} style={styles.cta} />
        </>
      )}

      {ex.kind === 'distance' && (
        <>
          <View style={styles.row}>
            <Field label="Distance" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" suffix={prefs.distanceUnit} style={styles.flex} autoFocus />
            <Field label="Time (optional)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" suffix="min" style={styles.flex} />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            label={`Add ${ex.name.toLowerCase()}`}
            style={styles.cta}
            onPress={() => {
              const d = parseDecimal(distance);
              if (!(d > 0)) return setError('Enter a distance.');
              const m = minutes.trim() ? parseInteger(minutes) : 0;
              if (Number.isNaN(m)) return setError('Time is in whole minutes.');
              save({ exerciseId, distanceM: distanceToMeters(d, prefs.distanceUnit), ...(m ? { durationSec: m * 60 } : {}) });
            }}
          />
        </>
      )}

      {ex.kind === 'strength' && (
        <>
          {last && (
            <Pressable
              style={({ pressed }) => [styles.repeat, pressed && styles.pressed]}
              accessibilityRole="button"
              onPress={() => save({ exerciseId, sets: last.e.sets?.map((x) => ({ ...x })) ?? [] })}>
              <Icon name="restore" size={22} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={type.bodyStrong}>Log same as last time</Text>
                <Text style={type.small}>
                  {describeEntry(last.e, prefs)} · {formatRelativeDay(last.date, today)}
                </Text>
              </View>
            </Pressable>
          )}
          <Text style={[type.small, styles.or]}>{last ? 'or add one set' : 'Add a set'}</Text>
          <View style={styles.row}>
            <Field label="Weight" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix={prefs.weightUnit} style={styles.flex} />
            <Field label="Reps" value={setReps2} onChangeText={setSetReps2} keyboardType="number-pad" style={styles.flex} />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            label="Add set"
            variant={last ? 'secondary' : 'primary'}
            style={styles.cta}
            onPress={() => {
              const w = parseDecimal(weight);
              const r = parseInteger(setReps2);
              if (Number.isNaN(w) || !(r > 0)) return setError('Enter weight and reps.');
              const sameAsTop = top && weight === trimNumber(kgToWeight(top.weightKg ?? 0, prefs.weightUnit), 2);
              save({ exerciseId, sets: [{ reps: r, weightKg: sameAsTop ? top!.weightKg : weightToKg(w, prefs.weightUnit) }] });
            }}
          />
        </>
      )}

      <View style={styles.links}>
        <Text style={styles.link} onPress={() => go('/log')} accessibilityRole="link">
          Full log
        </Text>
        <Text style={styles.link} onPress={() => go('/progress')} accessibilityRole="link">
          Progress
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { paddingBottom: space.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl, marginVertical: space.md },
  big: { fontSize: 48, fontWeight: '700', color: colors.text, minWidth: 96, textAlign: 'center', letterSpacing: -1 },
  row: { flexDirection: 'row', gap: space.sm },
  cta: { marginTop: space.lg },
  error: { color: colors.danger, marginTop: space.sm },
  repeat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  pressed: { opacity: 0.75 },
  or: { marginTop: space.lg, marginBottom: space.sm },
  links: { flexDirection: 'row', justifyContent: 'center', gap: space.xxl, marginTop: space.lg },
  link: { fontSize: 15, fontWeight: '600', color: colors.primary, paddingVertical: space.sm },
});
