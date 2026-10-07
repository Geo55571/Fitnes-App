import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';

import { formatDuration } from '@/domain/units';
import { cancelRestDone, scheduleRestDone } from '@/hooks/reminders';
import { colors, radius, space, tabular, type } from '@/theme';

import { Icon } from './Icon';
import { showToast } from './toast';
import { Chip } from './ui';

const buzz = (kind: 'done' | 'tap') => {
  if (Platform.OS === 'web') return;
  if (kind === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/** The current time, refreshed every `ms` while `active` (keeps clock reads out of render). */
function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, ms]);
  return now;
}

// ---------- stopwatch (plank holds, timed cardio) ----------

export function Stopwatch({ onStop, label = 'Timer' }: { onStop: (seconds: number) => void; label?: string }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const now = useNow(startedAt !== null);
  const elapsed = startedAt && now ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  const toggle = () => {
    buzz('tap');
    if (startedAt === null) setStartedAt(Date.now());
    else {
      const sec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setStartedAt(null);
      onStop(sec);
    }
  };

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={startedAt ? `${label} running, ${elapsed} seconds. Stop` : `Start ${label.toLowerCase()}`}
      style={({ pressed }) => [styles.stopwatch, startedAt !== null && styles.stopwatchOn, pressed && styles.pressed]}>
      <Icon name={startedAt ? 'stop' : 'play'} size={22} color={startedAt ? colors.onPrimary : colors.primary} />
      <Text style={[styles.swText, startedAt !== null && styles.swTextOn, tabular]}>
        {startedAt ? formatDuration(elapsed) : `Start ${label.toLowerCase()}`}
      </Text>
      {startedAt !== null && <Text style={styles.swHint}>Tap to stop</Text>}
    </Pressable>
  );
}

// ---------- rest timer (between sets) ----------

const useRest = create<{ endsAt: number | null; total: number }>(() => ({ endsAt: null, total: 0 }));

/** Whether a rest countdown is running (screens show the bar only then). */
export function useRestActive(): boolean {
  return useRest((s) => s.endsAt !== null);
}

export function startRest(seconds: number) {
  const endsAt = Date.now() + seconds * 1000;
  useRest.setState({ endsAt, total: seconds });
  buzz('tap');
  scheduleRestDone(new Date(endsAt)).catch(() => {});
}

export function stopRest() {
  useRest.setState({ endsAt: null, total: 0 });
  cancelRestDone().catch(() => {});
}

export function RestChips() {
  return (
    <View style={styles.restChips}>
      <Text style={type.caption}>Rest</Text>
      {[60, 90, 120].map((s) => (
        <Chip key={s} label={formatDuration(s)} onPress={() => startRest(s)} />
      ))}
    </View>
  );
}

/** Pinned countdown shown while a rest is running. Renders nothing otherwise. */
export function RestTimerBar() {
  const { endsAt, total } = useRest();
  const now = useNow(endsAt !== null);
  const remaining = endsAt ? (now ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : total) : 0;

  useEffect(() => {
    if (endsAt !== null && now > 0 && remaining === 0) {
      stopRest();
      buzz('done');
      showToast('Rest over — next set');
    }
  }, [endsAt, now, remaining]);

  if (endsAt === null) return null;
  const fraction = total ? remaining / total : 0;
  return (
    <View style={styles.restBar} accessibilityLiveRegion="polite" accessibilityLabel={`Rest, ${remaining} seconds left`}>
      <View style={[styles.restFill, { width: `${fraction * 100}%` }]} />
      <Icon name="timer-outline" size={20} color={colors.onPrimary} />
      <Text style={[styles.restText, tabular]}>Rest {formatDuration(remaining)}</Text>
      <Pressable onPress={() => startRest(remaining + 30)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add 30 seconds">
        <Text style={styles.restAction}>+30s</Text>
      </Pressable>
      <Pressable onPress={stopRest} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip rest">
        <Text style={styles.restAction}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  stopwatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    marginTop: space.md,
  },
  stopwatchOn: { backgroundColor: colors.primary },
  swText: { fontSize: 17, fontWeight: '600', color: colors.primary, flex: 1 },
  swTextOn: { color: colors.onPrimary, fontSize: 22 },
  swHint: { fontSize: 13, color: colors.primarySoft },
  restChips: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  restBar: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    overflow: 'hidden',
  },
  restFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.primary },
  restText: { flex: 1, color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
  restAction: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
});
