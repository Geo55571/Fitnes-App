import { addDays, diffDays, startOfWeek } from './dates';
import { getExercise, MUSCLES, type Muscle } from './exercises';
import { estimatedOneRepMax, totalInRange } from './metrics';
import type { DayKey, Metric, Session } from './types';
import { speedStyle } from './units';

/**
 * Derived trends for the Progress screen. Like metrics.ts, everything is computed
 * from saved sessions on demand — nothing here is stored.
 */

export interface Point {
  date: DayKey;
  value: number;
}

export type TrendFormat = 'weight' | 'reps' | 'duration' | 'distance' | 'pace' | 'pace100' | 'speed';

export interface Trend {
  title: string;
  caption: string;
  format: TrendFormat;
  points: Point[];
  lowerIsBetter: boolean;
}

/** Keeps the best value per day (max, or min when lower is better). */
function bestPerDay(rows: Point[], lowerIsBetter = false): Point[] {
  const byDay = new Map<DayKey, number>();
  for (const r of rows) {
    if (!(r.value > 0)) continue;
    const cur = byDay.get(r.date);
    if (cur === undefined || (lowerIsBetter ? r.value < cur : r.value > cur)) byDay.set(r.date, r.value);
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
}

/** The most useful trend line for an exercise over the window ending today. */
export function exerciseTrend(sessions: Session[], exerciseId: string, today: DayKey, days = 90): Trend {
  const start = addDays(today, -(days - 1));
  const rows: { date: DayKey; e: Session['entries'][number] }[] = [];
  for (const s of sessions) {
    if (s.date < start || s.date > today) continue;
    for (const e of s.entries) if (e.exerciseId === exerciseId) rows.push({ date: s.date, e });
  }
  const kind = getExercise(exerciseId).kind;

  if (kind === 'strength') {
    const pts = rows.flatMap(({ date, e }) =>
      (e.sets ?? []).filter((x) => x.reps <= 12).map((x) => ({ date, value: estimatedOneRepMax(x.weightKg ?? 0, x.reps) })),
    );
    return { title: 'Estimated 1-rep max', caption: 'Best set each day (Epley formula)', format: 'weight', points: bestPerDay(pts), lowerIsBetter: false };
  }
  if (kind === 'reps') {
    const pts = rows.flatMap(({ date, e }) => (e.sets ?? []).map((x) => ({ date, value: x.reps })));
    return { title: 'Best set', caption: 'Most reps in one set each day', format: 'reps', points: bestPerDay(pts), lowerIsBetter: false };
  }
  if (kind === 'duration') {
    const pts = rows.map(({ date, e }) => ({ date, value: e.durationSec ?? 0 }));
    return { title: 'Longest hold', caption: 'Longest hold each day', format: 'duration', points: bestPerDay(pts), lowerIsBetter: false };
  }
  // Distance: pace (or speed for bikes) is the better signal when durations are logged; otherwise distance.
  const timed = rows.filter(({ e }) => (e.distanceM ?? 0) > 0 && (e.durationSec ?? 0) > 0);
  if (timed.length >= 2) {
    const style = speedStyle(exerciseId);
    if (style === 'speed') {
      const pts = timed.map(({ date, e }) => ({ date, value: e.distanceM! / e.durationSec! }));
      return { title: 'Average speed', caption: 'Fastest session each day', format: 'speed', points: bestPerDay(pts), lowerIsBetter: false };
    }
    const pts = timed.map(({ date, e }) => ({ date, value: e.durationSec! / (e.distanceM! / 1000) }));
    return { title: 'Pace', caption: 'Fastest session each day · lower is faster', format: style, points: bestPerDay(pts, true), lowerIsBetter: true };
  }
  const pts = rows.map(({ date, e }) => ({ date, value: e.distanceM ?? 0 }));
  return { title: 'Longest session', caption: 'Longest distance each day', format: 'distance', points: bestPerDay(pts), lowerIsBetter: false };
}

/** The metric used when comparing periods for an exercise. */
export function summaryMetric(exerciseId: string): Metric {
  switch (getExercise(exerciseId).kind) {
    case 'strength':
      return 'volume';
    case 'reps':
      return 'reps';
    case 'duration':
      return 'duration';
    case 'distance':
      return 'distance';
  }
}

export interface PeriodCompare {
  exerciseId: string;
  metric: Metric;
  current: number;
  previous: number;
}

/**
 * This week so far (Monday → today) against the same days of last week,
 * so a Wednesday isn't compared with a whole previous week.
 */
export function weekComparison(sessions: Session[], today: DayKey): { rows: PeriodCompare[]; start: DayKey; prevStart: DayKey; prevEnd: DayKey } {
  const start = startOfWeek(today);
  const span = diffDays(today, start);
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(prevStart, span);
  const ids = new Set<string>();
  for (const s of sessions) {
    if ((s.date >= start && s.date <= today) || (s.date >= prevStart && s.date <= prevEnd)) {
      s.entries.forEach((e) => ids.add(e.exerciseId));
    }
  }
  const rows = [...ids].map((id) => {
    const metric = summaryMetric(id);
    return {
      exerciseId: id,
      metric,
      current: totalInRange(sessions, start, today, id, metric),
      previous: totalInRange(sessions, prevStart, prevEnd, id, metric),
    };
  });
  // Units differ between exercises, so order by activity then name rather than by value.
  rows.sort(
    (a, b) =>
      Number(b.current > 0) - Number(a.current > 0) ||
      getExercise(a.exerciseId).name.localeCompare(getExercise(b.exerciseId).name),
  );
  return { rows, start, prevStart, prevEnd };
}

/** Percent change, or null when there's no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Working sets per muscle group. A set counts once for each primary muscle of its
 * exercise; a plank hold counts as one set. Cardio isn't counted.
 */
export function muscleSets(sessions: Session[], start: DayKey, end: DayKey): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const s of sessions) {
    if (s.date < start || s.date > end) continue;
    for (const e of s.entries) {
      const ex = getExercise(e.exerciseId);
      const sets = ex.kind === 'duration' ? (e.durationSec ? 1 : 0) : (e.sets?.length ?? 0);
      for (const m of ex.muscles) out[m] += sets;
    }
  }
  return out;
}
