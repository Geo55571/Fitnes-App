import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { exerciseIconColor } from '@/components/Icon';
import { goBack } from '@/components/nav';
import { showToast } from '@/components/toast';
import { Button, Chip, ChipRow, EmptyState, Field, IconButton, Screen, StackHeader } from '@/components/ui';
import { addDays, diffDays, formatRelativeDay, startOfWeek } from '@/domain/dates';
import { allExercises, getExercise, METRIC_LABEL, metricsFor } from '@/domain/exercises';
import type { DayKey, Metric } from '@/domain/types';
import { useToday } from '@/hooks/today';
import { useStore } from '@/store/store';
import { groupsApi } from '@/sync';
import { colors, space, type } from '@/theme';

function defaultTitle(exerciseId: string, metric: Metric) {
  const ex = getExercise(exerciseId);
  if (metric === 'distance') return `${ex.name} distance`;
  if (metric === 'duration') return `${ex.name} time`;
  return `${ex.name} challenge`;
}

export default function NewChallenge() {
  const { group: groupId } = useLocalSearchParams<{ group: string }>();
  const today = useToday();
  const group = useStore((s) => s.groups.find((g) => g.id === groupId));
  const addChallenge = useStore((s) => s.addChallenge);

  const [exerciseId, setExerciseId] = useState('pushups');
  const [metric, setMetric] = useState<Metric>('reps');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<DayKey>(today);
  const [end, setEnd] = useState<DayKey>(addDays(today, 6));

  if (!group) {
    return (
      <Screen header={<StackHeader title="New challenge" />}>
        <EmptyState icon="account-group" title="Group not found" />
      </Screen>
    );
  }

  const ex = getExercise(exerciseId);
  const days = diffDays(end, start) + 1;

  const pickExercise = (id: string) => {
    setExerciseId(id);
    const ms = metricsFor(getExercise(id).kind);
    if (!ms.includes(metric)) setMetric(ms.includes('reps') ? 'reps' : ms[0]);
  };

  const preset = (kind: 'week' | '7' | '30') => {
    if (kind === 'week') {
      const s = startOfWeek(today);
      setStart(s);
      setEnd(addDays(s, 6));
    } else {
      setStart(today);
      setEnd(addDays(today, kind === '7' ? 6 : 29));
    }
  };

  const save = async () => {
    const challenge = { title: title.trim() || defaultTitle(exerciseId, metric), exerciseId, metric, startDate: start, endDate: end };
    try {
      if (group.remote) await groupsApi.addChallenge(group.id, challenge);
      else addChallenge(group.id, challenge);
      showToast('Challenge created');
      goBack();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t create the challenge.');
    }
  };

  return (
    <Screen header={<StackHeader title="New challenge" />} footer={<Button label="Create challenge" onPress={save} disabled={end < start} />}>
      <Text style={styles.label}>Exercise</Text>
      <View style={styles.wrap}>
        {allExercises().map((e) => (
          <Chip key={e.id} label={e.name} icon={e.icon} iconColor={exerciseIconColor(e.id)} selected={e.id === exerciseId} onPress={() => pickExercise(e.id)} />
        ))}
      </View>

      <Text style={styles.label}>Metric</Text>
      <ChipRow>
        {metricsFor(ex.kind).map((m) => (
          <Chip key={m} label={METRIC_LABEL[m]} selected={m === metric} onPress={() => setMetric(m)} />
        ))}
      </ChipRow>
      <Text style={[type.caption, styles.help]}>Highest total wins. Everyone’s logged {ex.name.toLowerCase()} between the dates counts.</Text>

      <Text style={styles.label}>Dates</Text>
      <ChipRow>
        <Chip label="This week" onPress={() => preset('week')} />
        <Chip label="Next 7 days" onPress={() => preset('7')} />
        <Chip label="Next 30 days" onPress={() => preset('30')} />
      </ChipRow>
      <DateStepper label="Starts" value={start} today={today} onChange={(d) => { setStart(d); if (d > end) setEnd(d); }} />
      <DateStepper label="Ends" value={end} today={today} min={start} onChange={setEnd} />
      <Text style={[type.caption, styles.help]}>{days} {days === 1 ? 'day' : 'days'}</Text>

      <Field label="Name (optional)" value={title} onChangeText={setTitle} placeholder={defaultTitle(exerciseId, metric)} maxLength={40} style={styles.name} />
    </Screen>
  );
}

function DateStepper({ label, value, today, min, onChange }: { label: string; value: DayKey; today: DayKey; min?: DayKey; onChange: (d: DayKey) => void }) {
  const canBack = !min || value > min;
  return (
    <View style={styles.stepper}>
      <Text style={type.body}>{label}</Text>
      <View style={styles.stepCtrl}>
        <IconButton icon="chevron-left" label={`${label} earlier`} color={canBack ? colors.text : colors.border} onPress={() => canBack && onChange(addDays(value, -1))} />
        <Text style={[type.bodyStrong, styles.stepText]}>{formatRelativeDay(value, today)}</Text>
        <IconButton icon="chevron-right" label={`${label} later`} onPress={() => onChange(addDays(value, 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: space.xl, marginBottom: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  help: { marginTop: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  stepCtrl: { flexDirection: 'row', alignItems: 'center' },
  stepText: { minWidth: 110, textAlign: 'center' },
  name: { marginTop: space.xl },
});
