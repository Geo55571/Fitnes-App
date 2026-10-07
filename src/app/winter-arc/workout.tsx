import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { confirmAction } from '@/components/confirm';
import { goBack } from '@/components/nav';
import { showToast } from '@/components/toast';
import { Button, Chip, ChipRow, Field, IconButton, Notice, Screen, Segmented, StackHeader } from '@/components/ui';
import { addDays, formatRelativeDay, startOfWeek } from '@/domain/dates';
import { distanceToMeters, metersToDistance, trimNumber } from '@/domain/units';
import { ACTIVITY_LABEL, isArcDay, WINTER_ARC, type ArcWorkoutKind, type EnduranceActivity } from '@/domain/winterArc';
import { useUnits } from '@/hooks/today';
import { useWinterArc } from '@/hooks/winterArc';
import { useStore } from '@/store/store';
import { colors, space, tabular, type } from '@/theme';

const STRENGTH_NAMES = ['Upper body', 'Lower body', 'Full body', 'Push', 'Pull', 'Legs'];
const ACTIVITIES: EnduranceActivity[] = ['running', 'jogging', 'cycling', 'other'];

/** Add or edit a strength or endurance workout. It is saved as a normal FORM session too. */
export default function ArcWorkoutScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string; kind?: ArcWorkoutKind }>();
  const prefs = useUnits();
  const { stats, today, data } = useWinterArc();
  const save = useStore((s) => s.saveArcWorkout);
  const remove = useStore((s) => s.deleteArcWorkout);
  const session = useStore((s) => (params.id ? s.sessions.find((x) => x.id === params.id) : undefined));
  const existing = params.id ? stats.workouts.find((w) => w.sessionId === params.id) : undefined;
  const meta = params.id ? data.workouts[params.id] : undefined;

  const first = stats.trackFrom ?? WINTER_ARC.start;
  const last = today < WINTER_ARC.end ? today : WINTER_ARC.end;
  const initialDate = session?.date ?? (params.date && isArcDay(params.date) && params.date <= last ? params.date : last);

  const [kind, setKind] = useState<ArcWorkoutKind>(meta?.kind ?? (params.kind === 'endurance' ? 'endurance' : 'strength'));
  const [date, setDate] = useState(initialDate);
  const [name, setName] = useState(meta?.kind === 'strength' || meta?.activity === 'other' ? meta.name : '');
  const [activity, setActivity] = useState<EnduranceActivity>(meta?.activity ?? 'running');
  const [minutes, setMinutes] = useState(existing?.durationSec ? trimNumber(existing.durationSec / 60, 0) : '');
  const [distance, setDistance] = useState(existing?.distanceM ? trimNumber(metersToDistance(existing.distanceM, prefs.distanceUnit), 2) : '');
  const [note, setNote] = useState(meta?.note ?? '');

  if (params.id && (!session || !meta)) {
    return (
      <Screen header={<StackHeader title="Workout" />}>
        <Notice icon="information-outline">This workout no longer exists.</Notice>
      </Screen>
    );
  }

  const week = stats.weeks.find((w) => w.start === startOfWeek(date));
  const sameKindThisWeek = week ? week[kind].workouts.filter((w) => w.sessionId !== params.id) : [];
  const atMax = new Set(sameKindThisWeek.map((w) => w.date)).size >= WINTER_ARC[kind].max && !sameKindThisWeek.some((w) => w.date === date);
  const sameDay = sameKindThisWeek.some((w) => w.date === date);

  const mins = Number(minutes.replace(',', '.'));
  const dist = Number(distance.replace(',', '.'));
  const minutesBad = minutes !== '' && !(mins > 0 && mins <= 1440);
  const distanceBad = distance !== '' && !(dist > 0 && dist < 1000);

  const submit = () => {
    if (minutesBad || distanceBad) return;
    const label =
      kind === 'strength' ? name.trim() || 'Strength training' : activity === 'other' ? name.trim() || 'Endurance' : ACTIVITY_LABEL[activity];
    save(
      {
        date,
        kind,
        activity: kind === 'endurance' ? activity : undefined,
        name: label,
        durationSec: minutes ? Math.round(mins * 60) : undefined,
        distanceM: kind === 'endurance' && distance ? distanceToMeters(dist, prefs.distanceUnit) : undefined,
        note,
        performedAt: session?.performedAt ?? (date === today ? new Date().toISOString() : `${date}T12:00:00.000Z`),
      },
      params.id,
    );
    showToast(params.id ? 'Workout updated' : `${label} added`);
    goBack();
  };

  const canPrev = addDays(date, -1) >= first;
  const canNext = addDays(date, 1) <= last;

  return (
    <Screen
      header={<StackHeader title={params.id ? 'Edit workout' : 'Add workout'} />}
      footer={<Button label={params.id ? 'Save changes' : 'Add workout'} onPress={submit} disabled={minutesBad || distanceBad} />}>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'strength', label: 'Strength', icon: 'weight-lifter' },
          { value: 'endurance', label: 'Endurance', icon: 'run' },
        ]}
      />

      <Text style={styles.label}>Date</Text>
      <View style={styles.dateRow}>
        <IconButton icon="chevron-left" label="Previous day" onPress={() => canPrev && setDate(addDays(date, -1))} color={canPrev ? colors.text : colors.borderStrong} />
        <Text style={[type.bodyStrong, tabular, styles.dateText]}>{formatRelativeDay(date, today)}</Text>
        <IconButton icon="chevron-right" label="Next day" onPress={() => canNext && setDate(addDays(date, 1))} color={canNext ? colors.text : colors.borderStrong} />
      </View>

      {kind === 'strength' ? (
        <>
          <Field label="Workout" placeholder="e.g. Upper body" value={name} onChangeText={setName} maxLength={60} style={styles.gap} />
          <View style={styles.chips}>
            <ChipRow>
              {STRENGTH_NAMES.map((n) => (
                <Chip key={n} label={n} selected={name === n} onPress={() => setName(n)} />
              ))}
            </ChipRow>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Activity</Text>
          <ChipRow>
            {ACTIVITIES.map((a) => (
              <Chip key={a} label={ACTIVITY_LABEL[a]} selected={activity === a} onPress={() => setActivity(a)} />
            ))}
          </ChipRow>
          {activity === 'other' && <Field label="What was it?" placeholder="e.g. Rowing" value={name} onChangeText={setName} maxLength={60} style={styles.gap} />}
        </>
      )}

      <View style={styles.row}>
        <Field
          label="Duration"
          placeholder="Optional"
          suffix="min"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="decimal-pad"
          inputMode="decimal"
          error={minutesBad ? 'Enter minutes' : undefined}
          style={styles.flex}
        />
        {kind === 'endurance' && (
          <Field
            label="Distance"
            placeholder="Optional"
            suffix={prefs.distanceUnit}
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={distanceBad ? 'Enter a distance' : undefined}
            style={styles.flex}
          />
        )}
      </View>

      <Field label="Note" placeholder="Optional" value={note} onChangeText={setNote} maxLength={280} multiline style={styles.gap} />

      {(atMax || sameDay) && (
        <View style={styles.gap}>
          <Notice icon="information-outline">
            {sameDay
              ? `There’s already a ${kind} workout on this day. Only one per day counts toward the weekly minimum.`
              : `This week already has ${WINTER_ARC[kind].max} ${kind} workouts — the most the rules allow. It’s saved, but won’t count.`}
          </Notice>
        </View>
      )}

      {params.id && (
        <Button
          label="Delete workout"
          variant="danger"
          compact
          style={styles.delete}
          onPress={() =>
            confirmAction('Delete this workout?', 'It’s removed from Winter Arc and from your log.', 'Delete', () => {
              remove(params.id!);
              showToast('Workout deleted');
              goBack();
            })
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 6, marginTop: space.lg },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 4, height: 48 },
  dateText: { flex: 1, textAlign: 'center' },
  gap: { marginTop: space.lg },
  chips: { marginTop: space.sm },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  delete: { marginTop: space.xxl, alignSelf: 'flex-start' },
});
