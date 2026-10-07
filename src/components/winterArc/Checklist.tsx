/**
 * The Winter Arc check-in as a plain list: tick what you did, then "Complete check-in".
 * Nothing is saved until the button is pressed. Details (minutes, notes, rule breaks,
 * approved exceptions) stay available on the day's detail page.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { showToast } from '@/components/toast';
import { formatMonthDay } from '@/domain/dates';
import type { DayKey } from '@/domain/types';
import { WINTER_ARC, type ArcMarkEntry, type ArcWorkoutKind, type ChallengeStatistics } from '@/domain/winterArc';
import { useStore } from '@/store/store';
import { colors, space, tabular, type } from '@/theme';

import { Icon } from '../Icon';
import { Button, Divider } from '../ui';
import { haptic } from './parts';

type Item = 'nutrition' | 'reading' | 'discipline' | ArcWorkoutKind;

const DAILY: { key: 'nutrition' | 'reading' | 'discipline'; title: string; note: string }[] = [
  { key: 'nutrition', title: 'No sweets, chips or sugary drinks', note: 'Fruit is fine' },
  { key: 'reading', title: `Read ${WINTER_ARC.readingMinutes} minutes`, note: 'In a printed book' },
  { key: 'discipline', title: 'Kept my discipline rule', note: 'Private · never shared' },
];

const WEEKLY: { key: ArcWorkoutKind; title: string; note: string }[] = [
  { key: 'strength', title: 'Strength training', note: `${WINTER_ARC.strength.min}–${WINTER_ARC.strength.max} per week` },
  { key: 'endurance', title: 'Cardio: run, jog or ride', note: `${WINTER_ARC.endurance.min}–${WINTER_ARC.endurance.max} per week` },
];

export function ArcChecklist({ date, stats, today }: { date: DayKey; stats: ChallengeStatistics; today: DayKey }) {
  const update = useStore((s) => s.updateArcDay);
  const saveWorkout = useStore((s) => s.saveArcWorkout);
  const deleteWorkout = useStore((s) => s.deleteArcWorkout);
  const info = stats.days.find((d) => d.date === date)!;
  const entry = info.entry;
  const week = stats.weeks.find((w) => w.from <= date && w.to >= date)!;
  const dayWorkouts = stats.workouts.filter((w) => w.date === date);
  const isToday = date === today;

  const kept = (o: string) => o === 'done' || o === 'exception';
  const saved: Record<Item, boolean> = {
    nutrition: kept(info.outcomes.nutrition),
    reading: kept(info.outcomes.reading),
    discipline: kept(info.outcomes.discipline),
    strength: dayWorkouts.some((w) => w.kind === 'strength'),
    endurance: dayWorkouts.some((w) => w.kind === 'endurance'),
  };
  // Workouts logged elsewhere in FORM count here too; they're changed in Log, not here.
  const fromLog = (k: ArcWorkoutKind) => dayWorkouts.some((w) => w.kind === k && !w.fromArc);

  const [draft, setDraft] = useState(saved);
  const dirty = (Object.keys(saved) as Item[]).some((k) => saved[k] !== draft[k]);
  const checkedIn = !!entry?.checkedInAt;
  const toggle = (k: Item) => {
    if ((k === 'strength' || k === 'endurance') && fromLog(k)) return showToast('Logged in FORM. Change it in Log.');
    haptic('light');
    setDraft((d) => ({ ...d, [k]: !d[k] }));
  };

  const weekCount = (k: ArcWorkoutKind) => week[k].count + (draft[k] === saved[k] ? 0 : draft[k] ? 1 : -1);

  const complete = () => {
    // A rule marked broken (or excepted) in the details stays as it was unless it's ticked here.
    const mark = (checked: boolean, prev?: ArcMarkEntry): ArcMarkEntry | undefined =>
      checked ? (prev && prev.mark !== 'broken' ? prev : { mark: 'done' }) : prev?.mark === 'broken' ? prev : undefined;
    const reading = entry?.reading;
    update(date, {
      nutrition: mark(draft.nutrition, entry?.nutrition),
      discipline: mark(draft.discipline, entry?.discipline),
      reading: draft.reading
        ? reading?.exception
          ? reading
          : { ...reading, minutes: Math.max(reading?.minutes ?? 0, WINTER_ARC.readingMinutes) }
        : reading && { ...reading, exception: false, minutes: reading.minutes >= WINTER_ARC.readingMinutes ? 0 : reading.minutes },
      checkedInAt: new Date().toISOString(),
    });
    for (const w of WEEKLY) {
      if (draft[w.key] && !saved[w.key]) {
        saveWorkout({
          date,
          kind: w.key,
          activity: w.key === 'endurance' ? 'other' : undefined,
          name: w.key === 'strength' ? 'Strength training' : 'Cardio',
          performedAt: isToday ? new Date().toISOString() : `${date}T12:00:00.000Z`,
        });
      } else if (!draft[w.key] && saved[w.key]) {
        for (const x of dayWorkouts) if (x.kind === w.key && x.fromArc) deleteWorkout(x.sessionId);
      }
    }
    const daily = DAILY.filter((d) => draft[d.key]).length;
    haptic('success');
    showToast(daily === DAILY.length ? `Checked in. All ${DAILY.length} daily rules done.` : `Checked in. ${daily} of ${DAILY.length} daily rules done.`);
  };

  return (
    <View>
      <Text style={styles.group}>Every day</Text>
      {DAILY.map((d, i) => (
        <View key={d.key}>
          {i > 0 && <Divider inset={44} />}
          <Row title={d.title} note={d.note} checked={draft[d.key]} onPress={() => toggle(d.key)} />
        </View>
      ))}
      <Text style={[styles.group, styles.groupGap]}>This week</Text>
      {WEEKLY.map((w, i) => (
        <View key={w.key}>
          {i > 0 && <Divider inset={44} />}
          <Row
            title={w.title}
            note={fromLog(w.key) ? 'Logged in FORM today' : `Done today? · ${w.note}`}
            checked={draft[w.key]}
            onPress={() => toggle(w.key)}
            right={week.weeklyApplies ? `${weekCount(w.key)}/${WINTER_ARC[w.key].min}` : undefined}
            met={week.weeklyApplies && weekCount(w.key) >= WINTER_ARC[w.key].min}
          />
        </View>
      ))}

      {checkedIn && !dirty ? (
        <View style={styles.done} accessibilityLiveRegion="polite">
          <Icon name="check-decagram" size={20} color={colors.primary} />
          <Text style={[type.bodyStrong, styles.doneText]}>Checked in{isToday ? ' for today' : ` for ${formatMonthDay(date)}`}</Text>
        </View>
      ) : (
        <Button label={checkedIn ? 'Save changes' : isToday ? 'Complete check-in for today' : `Complete check-in for ${formatMonthDay(date)}`} icon="check" onPress={complete} style={styles.button} />
      )}
      <Pressable onPress={() => router.push({ pathname: '/winter-arc/day/[date]', params: { date } })} hitSlop={8} accessibilityRole="button" style={styles.details}>
        <Text style={styles.detailsText}>Minutes, notes or an exception</Text>
      </Pressable>
    </View>
  );
}

function Row({ title, note, checked, onPress, right, met }: { title: string; note: string; checked: boolean; onPress: () => void; right?: string; met?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Icon name={checked ? 'check-circle' : 'circle-outline'} size={28} color={checked ? colors.primary : colors.borderStrong} />
      <View style={styles.body}>
        <Text style={[type.body, checked && styles.checkedText]}>{title}</Text>
        <Text style={type.caption}>{note}</Text>
      </View>
      {right ? <Text style={[styles.count, tabular, met && styles.countMet]}>{right}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 2 },
  groupGap: { marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: 8, borderRadius: 10 },
  pressed: { backgroundColor: colors.surfaceMuted },
  body: { flex: 1, minWidth: 0, gap: 1 },
  checkedText: { fontWeight: '600' },
  count: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  countMet: { color: colors.primary },
  button: { marginTop: space.lg },
  done: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.lg, height: 52, borderRadius: 12, backgroundColor: colors.primaryTint },
  doneText: { color: colors.primary },
  details: { alignSelf: 'center', marginTop: space.md, paddingVertical: 4 },
  detailsText: { fontSize: 13, color: colors.textTertiary, fontWeight: '500' },
});
