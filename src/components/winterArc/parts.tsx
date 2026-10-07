/**
 * Building blocks for the Winter Arc screens, in the app's own visual language (see ui.tsx).
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from '@/domain/exercises';
import { formatDistance, formatDurationWords, type UnitPrefs } from '@/domain/units';
import {
  ACTIVITY_LABEL,
  type ArcDayStatus,
  type ArcMark,
  type RuleOutcome,
  type WorkoutEntry,
} from '@/domain/winterArc';
import { colors, radius, space, tabular, type } from '@/theme';

import { Icon } from '../Icon';
import { Chip, ChipRow, ProgressBar } from '../ui';

// ---------- colours ----------

/** Day colours on the light background (calendar, week strip). */
export const DAY_COLOR: Record<ArcDayStatus, string> = {
  perfect: colors.primary,
  excused: colors.sage,
  partial: '#F3B9A8',
  failed: colors.coral,
  missed: colors.borderStrong,
  open: colors.surface,
  future: colors.surfaceMuted,
  untracked: colors.bg,
};

export const DAY_LABEL: Record<ArcDayStatus, string> = {
  perfect: 'Completed',
  excused: 'With exception',
  partial: 'Partial',
  failed: 'Rule broken',
  missed: 'Missed',
  open: 'Today',
  future: 'Upcoming',
  untracked: 'Not tracked',
};

export function haptic(kind: 'success' | 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.selectionAsync().catch(() => {});
}

// ---------- outcome mark ----------

/** ✓ done, ✕ broken, ≈ exception, ○ open — small and quiet. */
export function OutcomeIcon({ outcome, size = 20 }: { outcome: RuleOutcome | 'met' | 'unmet'; size?: number }) {
  switch (outcome) {
    case 'done':
    case 'met':
      return <Icon name="check-circle" size={size} color={colors.primary} />;
    case 'broken':
      return <Icon name="close-circle-outline" size={size} color={colors.coral} />;
    case 'exception':
      return <Icon name="minus-circle-outline" size={size} color={colors.textSecondary} />;
    case 'partial':
      return <Icon name="circle-slice-3" size={size} color={colors.coral} />;
    default:
      return <Icon name="circle-outline" size={size} color={colors.borderStrong} />;
  }
}

/** One line of a summary: label · value · mark. */
export function StatusRow({ label, value, outcome, onPress }: { label: string; value?: string; outcome: RuleOutcome | 'met' | 'unmet'; onPress?: () => void }) {
  const body = (
    <>
      <Text style={[type.body, styles.flex]}>{label}</Text>
      {value ? <Text style={[type.bodyStrong, tabular]}>{value}</Text> : null}
      <OutcomeIcon outcome={outcome} />
    </>
  );
  if (!onPress) return <View style={styles.statusRow}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.statusRow, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

// ---------- mark picker ----------

const MARK_ICON: Record<ArcMark, IconName> = { done: 'check', broken: 'close', exception: 'minus' };

/**
 * Three-way choice for a daily rule. Tapping the selected option again clears it.
 * Broken and Exception are shown plainly — the point is an honest record, not a red alarm.
 */
export function MarkPicker({
  value,
  labels,
  onChange,
  accessibilityLabel,
}: {
  value?: ArcMark;
  labels: Record<ArcMark, string>;
  onChange: (m: ArcMark | null) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {(['done', 'broken', 'exception'] as ArcMark[]).map((m) => {
        const on = value === m;
        const fg = on ? (m === 'done' ? colors.onPrimary : m === 'broken' ? colors.danger : colors.text) : colors.text;
        return (
          <Pressable
            key={m}
            onPress={() => {
              haptic('light');
              onChange(on ? null : m);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={labels[m]}
            style={[styles.option, on && m === 'done' && styles.optionDone, on && m === 'broken' && styles.optionBroken, on && m === 'exception' && styles.optionException]}>
            {on ? <Icon name={MARK_ICON[m]} size={16} color={fg} /> : null}
            <Text style={[styles.optionText, { color: fg }, on && styles.optionTextOn]} numberOfLines={1}>
              {labels[m]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- reading ----------

export function ReadingControl({ minutes, target, onChange }: { minutes: number; target: number; onChange: (m: number) => void }) {
  const [text, setText] = useState(String(minutes));
  const [shown, setShown] = useState(minutes);
  // Follow changes made by the buttons (leaving the field alone while it is being typed in).
  if (minutes !== shown) {
    setShown(minutes);
    if ((Number(text) || 0) !== minutes) setText(String(minutes));
  }
  const set = (m: number) => {
    haptic('light');
    onChange(Math.max(0, Math.min(1440, m)));
  };
  const done = minutes >= target;
  return (
    <View>
      <View style={styles.readingRow}>
        <Pressable onPress={() => set(minutes - 5)} style={({ pressed }) => [styles.step, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="5 minutes less" hitSlop={4}>
          <Icon name="minus" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.readingValue}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              const digits = t.replace(/\D/g, '').slice(0, 4);
              setText(digits);
              onChange(Math.min(1440, Number(digits) || 0));
            }}
            onBlur={() => setText(String(minutes))}
            keyboardType="number-pad"
            inputMode="numeric"
            selectTextOnFocus
            accessibilityLabel="Minutes read"
            style={[styles.readingInput, tabular, done && styles.readingDone]}
          />
          <Text style={[type.small, tabular, styles.readingOf]} numberOfLines={1}>
            / {target} min
          </Text>
        </View>
        <Pressable onPress={() => set(minutes + 5)} style={({ pressed }) => [styles.step, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="5 minutes more" hitSlop={4}>
          <Icon name="plus" size={22} color={colors.text} />
        </Pressable>
      </View>
      <ProgressBar fraction={minutes / target} done={done} style={styles.readingBar} />
      <ChipRow>
        {[5, 10, 30].map((n) => (
          <Chip key={n} label={`+${n} min`} onPress={() => set(minutes + n)} />
        ))}
      </ChipRow>
    </View>
  );
}

// ---------- weekly blocks ----------

/** ■■□□ — filled squares for workouts, the minimum marked by a stronger outline. */
export function WeekBlocks({ count, min, max }: { count: number; min: number; max: number }) {
  return (
    <View style={styles.blocks} accessibilityLabel={`${count} of ${max}, minimum ${min}`}>
      {Array.from({ length: Math.max(max, count) }, (_, i) => (
        <View key={i} style={[styles.block, i < min && styles.blockRequired, i < count && styles.blockOn, i >= max && styles.blockOver]} />
      ))}
    </View>
  );
}

// ---------- workouts ----------

export function workoutSummary(w: WorkoutEntry, prefs: UnitPrefs): string {
  const parts: string[] = [];
  if (w.kind === 'endurance' && w.activity && w.activity !== 'other' && ACTIVITY_LABEL[w.activity] !== w.name) parts.push(ACTIVITY_LABEL[w.activity]);
  if (w.distanceM) parts.push(formatDistance(w.distanceM, prefs.distanceUnit));
  if (w.durationSec) parts.push(formatDurationWords(w.durationSec));
  if (!parts.length) parts.push(w.kind === 'strength' ? 'Strength' : 'Endurance');
  return parts.join(' · ');
}

/** A workout in a list. Ones added in Winter Arc open its editor; others open the normal session view. */
export function WorkoutRow({ workout, prefs, showDate, dateLabel }: { workout: WorkoutEntry; prefs: UnitPrefs; showDate?: boolean; dateLabel?: string }) {
  const icon: IconName = workout.kind === 'strength' ? 'weight-lifter' : workout.activity === 'cycling' ? 'bike' : 'run';
  const open = () =>
    workout.fromArc
      ? router.push({ pathname: '/winter-arc/workout', params: { id: workout.sessionId } })
      : router.push({ pathname: '/session/[id]', params: { id: workout.sessionId } });
  return (
    <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.workout, pressed && styles.pressed]}>
      <View style={styles.workoutIcon}>
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={type.body} numberOfLines={1}>
          {workout.name}
        </Text>
        <Text style={type.small} numberOfLines={2}>
          {showDate && dateLabel ? `${dateLabel} · ` : ''}
          {workoutSummary(workout, prefs)}
          {workout.note ? ` · ${workout.note}` : ''}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

// ---------- celebration ----------

/** The day's state at the top of the check-in. Pops once when the last daily rule is completed. */
export function DayBadge({ perfect, done, total, style }: { perfect: boolean; done: number; total: number; style?: StyleProp<ViewStyle> }) {
  const [scale] = useState(() => new Animated.Value(1));
  const was = useRef(perfect);
  useEffect(() => {
    if (perfect && !was.current) {
      haptic('success');
      scale.setValue(0.82);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    }
    was.current = perfect;
  }, [perfect, scale]);
  return (
    <Animated.View style={[styles.badge, perfect && styles.badgeOn, { transform: [{ scale }] }, style]} accessibilityLiveRegion="polite">
      <Icon name={perfect ? 'check-decagram' : 'progress-check'} size={18} color={perfect ? colors.onPrimary : colors.textSecondary} />
      <Text style={[styles.badgeText, perfect && styles.badgeTextOn]}>{perfect ? 'All daily rules done' : `${done} of ${total} done`}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: colors.surfaceMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, paddingVertical: 6 },
  picker: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 3,
  },
  option: { flex: 1, height: 42, borderRadius: radius.sm + 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  optionDone: { backgroundColor: colors.primary },
  optionBroken: { backgroundColor: colors.coralSoft },
  optionException: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderStrong },
  optionText: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  optionTextOn: { fontWeight: '600' },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  step: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readingValue: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  readingInput: { width: 76, fontSize: 34, fontWeight: '700', color: colors.text, letterSpacing: -0.8, textAlign: 'right', padding: 0 },
  readingOf: { flexShrink: 0 },
  readingDone: { color: colors.primary },
  readingBar: { marginTop: space.md, marginBottom: space.md },
  blocks: { flexDirection: 'row', gap: 5 },
  block: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  blockRequired: { borderColor: colors.textTertiary },
  blockOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  blockOver: { backgroundColor: colors.coral, borderColor: colors.coral },
  workout: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.lg, minHeight: 56 },
  workoutIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  badgeOn: { backgroundColor: colors.primary },
  badgeText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  badgeTextOn: { color: colors.onPrimary },
});
