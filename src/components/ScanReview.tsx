import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IconName } from '@/domain/exercises';
import { trimNumber, type UnitPrefs } from '@/domain/units';
import type { ScanActivity, ScanWorkout } from '@/domain/workoutScan';
import type { ScanDraft } from '@/scan';
import { colors, radius, space, type } from '@/theme';

import { Icon } from './Icon';
import { Button, Card, Chip, Field } from './ui';

const ACTIVITIES: { value: ScanActivity; label: string; icon: IconName }[] = [
  { value: 'running', label: 'Run', icon: 'run' },
  { value: 'walking', label: 'Walk', icon: 'walk' },
  { value: 'cycling', label: 'Cycling', icon: 'bike' },
  { value: 'swimming', label: 'Swim', icon: 'swim' },
  { value: 'hiking', label: 'Hike', icon: 'hiking' },
  { value: 'rowing', label: 'Rowing', icon: 'rowing' },
  { value: 'strength_training', label: 'Strength', icon: 'weight-lifter' },
  { value: 'hiit', label: 'HIIT', icon: 'lightning-bolt' },
  { value: 'elliptical', label: 'Elliptical', icon: 'run-fast' },
  { value: 'yoga', label: 'Yoga', icon: 'meditation' },
  { value: 'other', label: 'Other', icon: 'dots-horizontal' },
];

const DIST_UNITS = ['km', 'mi', 'm'] as const;
type DistUnit = (typeof DIST_UNITS)[number];

const numText = (v: number | null | undefined) => (v === null || v === undefined ? '' : trimNumber(v, 2));
const readNum = (t: string): number | null => {
  const s = t.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

interface Props {
  draft: ScanDraft;
  prefs: UnitPrefs;
  /** Returns false if the workout couldn't be saved. */
  onSave: (w: ScanWorkout) => boolean;
  onDiscard: () => void;
}

/**
 * "Check and save": the workout as read from the photo, every value editable, missing ones
 * empty. Used when the reading isn't certain enough to save on its own.
 */
export function ScanReview({ draft, prefs, onSave, onDiscard }: Props) {
  const w = draft.workout;
  const known = draft.fromPhoto;
  const [activity, setActivity] = useState<ScanActivity | null>(known.activity ? w.activity : null);
  const [name, setName] = useState(w.activity === 'other' && known.activity ? w.title : '');
  // Minutes and seconds as two number fields: phone number pads have no ":" key.
  const [min, setMin] = useState(w.duration_seconds ? String(Math.floor(w.duration_seconds / 60)) : '');
  const [sec, setSec] = useState(w.duration_seconds ? String(Math.round(w.duration_seconds % 60)).padStart(2, '0') : '');
  const [dist, setDist] = useState(numText(w.distance?.value));
  const [unit, setUnit] = useState<DistUnit>(
    w.distance?.unit === 'mi' || w.distance?.unit === 'm' ? w.distance.unit : w.distance?.unit === 'yd' ? 'm' : prefs.distanceUnit,
  );
  const [active, setActive] = useState(numText(w.active_kcal));
  const [total, setTotal] = useState(numText(w.total_kcal));
  const [hr, setHr] = useState(numText(w.avg_heart_rate));
  const [showText, setShowText] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const e: Record<string, string> = {};
    if (!activity) e.activity = 'Choose the kind of workout';
    if (activity === 'other' && !name.trim()) e.name = 'Give it a name';
    const mm = readNum(min);
    const ss = readNum(sec);
    const timed = min.trim() || sec.trim();
    const secs = timed && !Number.isNaN(mm) && !Number.isNaN(ss) && (ss ?? 0) < 60 ? Math.round((mm ?? 0) * 60 + (ss ?? 0)) : null;
    if (timed && secs === null) e.time = 'Minutes, and seconds from 0 to 59';
    const d = readNum(dist);
    if (Number.isNaN(d)) e.dist = 'Enter a number';
    if (!secs && !d) e.time = e.time ?? 'Enter the time (or a distance)';
    const a = readNum(active);
    const t = readNum(total);
    const h = readNum(hr);
    if (Number.isNaN(a)) e.active = 'Enter a number';
    if (Number.isNaN(t)) e.total = 'Enter a number';
    if (Number.isNaN(h) || (h !== null && (h < 30 || h > 240))) e.hr = 'Between 30 and 240';
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = onSave({
      ...w,
      activity: activity!,
      title: activity === 'other' ? name.trim() : (ACTIVITIES.find((x) => x.value === activity)?.label ?? 'Workout'),
      duration_seconds: secs,
      distance: d ? { value: d, unit } : null,
      active_kcal: a,
      total_kcal: t,
      avg_heart_rate: h,
    });
    if (!ok) setErrors({ form: 'This workout couldn’t be saved. Check the time and distance.' });
  };

  const guessed = draft.guessed ?? {};
  const fromPhoto = (k: keyof ScanDraft['fromPhoto']) =>
    k === 'distance' && guessed.distance ? 'worked out from pace and time' : known[k] ? 'from photo' : undefined;
  const anyKnown = Object.values(known).some(Boolean);

  return (
    <Card style={styles.card}>
      <Text style={type.section}>{anyKnown ? 'Check and save' : 'Fill in the workout'}</Text>
      <Text style={type.small}>
        {anyKnown
          ? 'Here’s what was read from your photo. Fix anything that’s wrong and add what’s missing.'
          : 'The numbers couldn’t be read clearly. Enter them here — it only takes a moment.'}
      </Text>

      <Text style={styles.label}>Workout{guessed.activity ? ' · guessed from the numbers' : known.activity ? ' · from photo' : ''}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {ACTIVITIES.map((a) => (
          <Chip key={a.value} label={a.label} icon={a.icon} selected={activity === a.value} onPress={() => setActivity(a.value)} />
        ))}
      </View>
      {errors.activity ? <Text style={styles.error}>{errors.activity}</Text> : null}
      {activity === 'other' && <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Pilates" error={errors.name} />}

      <View style={styles.row}>
        <Field
          label="Time"
          hint={fromPhoto('duration')}
          value={min}
          onChangeText={setMin}
          placeholder="0"
          keyboardType="number-pad"
          inputMode="numeric"
          suffix="min"
          accessibilityLabel="Time, minutes"
          error={errors.time}
          style={styles.flex}
        />
        <Field
          label=" "
          value={sec}
          onChangeText={setSec}
          placeholder="00"
          keyboardType="number-pad"
          inputMode="numeric"
          suffix="sec"
          accessibilityLabel="Time, seconds"
          maxLength={2}
          style={styles.flex}
        />
      </View>
      <View style={styles.row}>
        <Field
          label="Distance"
          hint={fromPhoto('distance')}
          value={dist}
          onChangeText={setDist}
          placeholder="0"
          keyboardType="decimal-pad"
          inputMode="decimal"
          suffix={unit}
          error={errors.dist}
          style={styles.flex}
        />
      </View>
      <View style={styles.unitRow}>
        {DIST_UNITS.map((u) => (
          <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
        ))}
      </View>
      <View style={styles.row}>
        <Field
          label="Active kcal"
          hint={fromPhoto('active_kcal')}
          value={active}
          onChangeText={setActive}
          placeholder="—"
          keyboardType="number-pad"
          inputMode="numeric"
          error={errors.active}
          style={styles.flex}
        />
        <Field
          label="Total kcal"
          hint={fromPhoto('total_kcal')}
          value={total}
          onChangeText={setTotal}
          placeholder="—"
          keyboardType="number-pad"
          inputMode="numeric"
          error={errors.total}
          style={styles.flex}
        />
      </View>
      <Field
        label="Avg heart rate"
        hint={fromPhoto('avg_hr')}
        value={hr}
        onChangeText={setHr}
        placeholder="—"
        keyboardType="number-pad"
        inputMode="numeric"
        suffix="bpm"
        error={errors.hr}
      />
      {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}

      <Button label="Save workout" icon="check" onPress={save} style={styles.save} />
      <Button label="Discard" variant="ghost" onPress={onDiscard} />

      {draft.lines.length > 0 && (
        <View>
          <Pressable
            onPress={() => setShowText((v) => !v)}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: showText }}>
            <Icon name={showText ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
            <Text style={type.small}>Text read from the photo</Text>
          </Pressable>
          {showText && (
            <View style={styles.text}>
              {draft.lines.map((l, i) => (
                <Text key={i} style={styles.line} selectable>
                  {l}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { marginTop: space.lg, gap: space.sm },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  unitRow: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end', marginTop: -space.xs },
  error: { fontSize: 12, color: colors.danger },
  save: { marginTop: space.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm, alignSelf: 'flex-start' },
  text: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: space.md, gap: 2 },
  line: { fontSize: 13, color: colors.textSecondary },
});
