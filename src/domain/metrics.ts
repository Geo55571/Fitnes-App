import { addDays, diffDays, startOfWeek, weekday } from './dates';
import { getExercise } from './exercises';
import { isComplete, speedStyle } from './units';
import type { DayKey, Entry, Goal, Metric, Session } from './types';

/**
 * Pure aggregation over saved sessions. Every number the UI shows is derived here,
 * so totals, goals, trackers, charts and leaderboards can never disagree.
 */

export function entryValue(entry: Entry, metric: Metric): number {
  switch (metric) {
    case 'reps':
      return (entry.sets ?? []).reduce((s, r) => s + r.reps, 0);
    case 'sets':
      return entry.sets?.length ?? 0;
    case 'volume':
      return (entry.sets ?? []).reduce((s, r) => s + r.reps * (r.weightKg ?? 0), 0);
    case 'distance':
      return entry.distanceM ?? 0;
    case 'duration':
      return entry.durationSec ?? 0;
  }
}

export function sessionValue(session: Session, exerciseId: string, metric: Metric): number {
  let total = 0;
  for (const e of session.entries) {
    if (e.exerciseId === exerciseId) total += entryValue(e, metric);
  }
  return total;
}

export function sessionsOn(sessions: Session[], date: DayKey): Session[] {
  return sessions
    .filter((s) => s.date === date)
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
}

export function totalInRange(
  sessions: Session[],
  start: DayKey,
  end: DayKey,
  exerciseId: string,
  metric: Metric,
): number {
  let total = 0;
  for (const s of sessions) {
    if (s.date >= start && s.date <= end) total += sessionValue(s, exerciseId, metric);
  }
  return total;
}

export function dayTotal(sessions: Session[], date: DayKey, exerciseId: string, metric: Metric): number {
  return totalInRange(sessions, date, date, exerciseId, metric);
}

/** Per-bucket totals. Buckets are [start, end] inclusive day ranges. */
export function bucketTotals(
  sessions: Session[],
  buckets: { start: DayKey; end: DayKey }[],
  exerciseId: string,
  metric: Metric,
): number[] {
  return buckets.map((b) => totalInRange(sessions, b.start, b.end, exerciseId, metric));
}

// ---------- goals ----------

export function goalAppliesOn(goal: Goal, date: DayKey): boolean {
  if (date < goal.startDate) return false;
  if (goal.endDate && date > goal.endDate) return false;
  switch (goal.schedule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return goal.schedule.days.includes(weekday(date));
    case 'once':
      return goal.schedule.date === date;
    case 'weekly':
      return true;
  }
}

/** Weekly goals measure the Monday–Sunday total; everything else is per day. */
export function goalPeriod(goal: Goal): 'day' | 'week' {
  return goal.schedule.type === 'weekly' ? 'week' : 'day';
}

export function goalsOn(goals: Goal[], date: DayKey): Goal[] {
  return goals.filter((g) => goalAppliesOn(g, date));
}

export interface GoalProgress {
  goal: Goal;
  period: 'day' | 'week';
  value: number;
  target: number;
  done: boolean;
  /** 0..1 */
  fraction: number;
}

export function goalProgress(
  goal: Goal,
  date: DayKey,
  sessions: Session[],
  checks: Record<string, DayKey[]>,
): GoalProgress {
  const period = goalPeriod(goal);
  const start = period === 'week' ? startOfWeek(date) : date;
  const end = period === 'week' ? addDays(start, 6) : date;
  if (goal.kind === 'todo') {
    const done = (checks[goal.id] ?? []).some((d) => d >= start && d <= end);
    return { goal, period, value: done ? 1 : 0, target: 1, done, fraction: done ? 1 : 0 };
  }
  const target = goal.target ?? 0;
  const value = totalInRange(sessions, start, end, goal.exerciseId!, goal.metric!);
  const done = isComplete(value, target);
  const fraction = target > 0 ? (done ? 1 : Math.min(value / target, 0.999)) : 0;
  return { goal, period, value, target, done, fraction };
}

export interface DaySummary {
  /** Counts and items cover per-day goals only. */
  total: number;
  done: number;
  items: GoalProgress[];
  /** Weekly goals active on this day, with week-to-date progress. */
  weekly: GoalProgress[];
}

export function daySummary(
  goals: Goal[],
  date: DayKey,
  sessions: Session[],
  checks: Record<string, DayKey[]>,
): DaySummary {
  const all = goalsOn(goals, date).map((g) => goalProgress(g, date, sessions, checks));
  const items = all.filter((i) => i.period === 'day');
  return { total: items.length, done: items.filter((i) => i.done).length, items, weekly: all.filter((i) => i.period === 'week') };
}

/** The first active per-day goal that matches an exercise/metric (trackers show today's total). */
export function matchingGoal(
  goals: Goal[],
  date: DayKey,
  exerciseId: string,
  metric: Metric,
): Goal | undefined {
  return goals.find(
    (g) =>
      g.kind === 'metric' &&
      goalPeriod(g) === 'day' &&
      g.exerciseId === exerciseId &&
      g.metric === metric &&
      goalAppliesOn(g, date),
  );
}

// ---------- history & records ----------

export function activeDays(sessions: Session[]): Set<DayKey> {
  return new Set(sessions.map((s) => s.date));
}

/** Consecutive active days ending today (or yesterday, if today has nothing yet). */
export function currentStreak(sessions: Session[], today: DayKey): number {
  const days = activeDays(sessions);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function exercisesUsed(sessions: Session[]): string[] {
  const lastUsed = new Map<string, string>();
  for (const s of sessions) {
    for (const e of s.entries) {
      const prev = lastUsed.get(e.exerciseId);
      if (!prev || prev < s.performedAt) lastUsed.set(e.exerciseId, s.performedAt);
    }
  }
  return [...lastUsed.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id);
}

export type RecordFormat = 'reps' | 'weight' | 'distance' | 'duration' | 'pace' | 'pace100' | 'speed' | 'volume';

export interface PersonalBest {
  key: string;
  label: string;
  value: number;
  format: RecordFormat;
  date: DayKey;
  /** For weight records: reps at that weight. */
  detail?: string;
}

/** Epley estimate; only meaningful for sets of 1–12 reps. */
export function estimatedOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function personalBests(sessions: Session[], exerciseId: string): PersonalBest[] {
  const kind = getExercise(exerciseId).kind;
  const best = new Map<string, PersonalBest>();
  const consider = (pb: PersonalBest, lowerIsBetter = false) => {
    const cur = best.get(pb.key);
    if (!cur || (lowerIsBetter ? pb.value < cur.value : pb.value > cur.value)) best.set(pb.key, pb);
  };

  const byDay = new Map<DayKey, number>();

  for (const s of sessions) {
    for (const e of s.entries) {
      if (e.exerciseId !== exerciseId) continue;
      if (kind === 'reps') {
        for (const set of e.sets ?? []) {
          consider({ key: 'set', label: 'Most in one set', value: set.reps, format: 'reps', date: s.date });
        }
        byDay.set(s.date, (byDay.get(s.date) ?? 0) + entryValue(e, 'reps'));
      } else if (kind === 'strength') {
        for (const set of e.sets ?? []) {
          const w = set.weightKg ?? 0;
          if (w > 0) {
            consider({
              key: 'heaviest',
              label: 'Heaviest set',
              value: w,
              format: 'weight',
              date: s.date,
              detail: `× ${set.reps}`,
            });
            if (set.reps <= 12) {
              consider({
                key: '1rm',
                label: 'Est. 1-rep max',
                value: estimatedOneRepMax(w, set.reps),
                format: 'weight',
                date: s.date,
              });
            }
          }
        }
        consider({ key: 'volume', label: 'Best session volume', value: entryValue(e, 'volume'), format: 'volume', date: s.date });
      } else if (kind === 'duration') {
        consider({ key: 'longest', label: 'Longest hold', value: e.durationSec ?? 0, format: 'duration', date: s.date });
        byDay.set(s.date, (byDay.get(s.date) ?? 0) + (e.durationSec ?? 0));
      } else if (kind === 'distance') {
        const d = e.distanceM ?? 0;
        consider({ key: 'longest', label: 'Longest', value: d, format: 'distance', date: s.date });
        if (d > 0 && e.durationSec) {
          // Runners think in pace (seconds per km, converted for display); cyclists in speed (m/s).
          const style = speedStyle(exerciseId);
          if (style === 'speed') consider({ key: 'speed', label: 'Top speed', value: d / e.durationSec, format: 'speed', date: s.date });
          else consider({ key: 'pace', label: 'Fastest pace', value: e.durationSec / (d / 1000), format: style, date: s.date }, true);
        }
        byDay.set(s.date, (byDay.get(s.date) ?? 0) + d);
      }
    }
  }

  for (const [date, v] of byDay) {
    if (kind === 'reps') consider({ key: 'day', label: 'Best day', value: v, format: 'reps', date });
    if (kind === 'duration') consider({ key: 'day', label: 'Most in a day', value: v, format: 'duration', date });
    if (kind === 'distance') consider({ key: 'day', label: 'Most in a day', value: v, format: 'distance', date });
  }

  const order = ['set', 'day', 'heaviest', '1rm', 'volume', 'longest', 'pace', 'speed'];
  return [...best.values()]
    .filter((p) => p.value > 0)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/** Short human description of a session entry, e.g. "3 × 8 @ 60 kg". Units are applied by the caller. */
export function describeSets(entry: Entry): { sets: number; reps: number; topWeightKg: number } {
  const sets = entry.sets ?? [];
  return {
    sets: sets.length,
    reps: sets.reduce((s, r) => s + r.reps, 0),
    topWeightKg: sets.reduce((m, r) => Math.max(m, r.weightKg ?? 0), 0),
  };
}

export function daysBetweenInclusive(start: DayKey, end: DayKey): number {
  return diffDays(end, start) + 1;
}

/** Distinct days with any activity in the `days`-day window ending today. */
export function activeDaysInWindow(sessions: Session[], today: DayKey, days: number): number {
  const start = addDays(today, -(days - 1));
  return new Set(sessions.filter((s) => s.date >= start && s.date <= today).map((s) => s.date)).size;
}

/**
 * How athletic the avatar looks: the chosen build plus up to +0.55 for consistency
 * (share of active days in the last 28). Range ≈ -0.3 … 1.
 */
export function athleticLevel(build: 'lean' | 'regular' | 'muscular', activeDays28: number): number {
  const base = build === 'lean' ? -0.3 : build === 'muscular' ? 0.45 : 0;
  return base + Math.min(1, activeDays28 / 28) * 0.55;
}
