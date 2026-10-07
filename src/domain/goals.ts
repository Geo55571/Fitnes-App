import { addDays, startOfWeek } from './dates';
import { getExercise } from './exercises';
import { goalAppliesOn, goalPeriod, goalProgress, totalInRange } from './metrics';
import type { DayKey, Goal, Metric, Schedule, Session } from './types';
import { METERS_PER_MILE, type UnitPrefs } from './units';

// ---------- automatic progression ----------

/** A sensible default increment, in canonical units, for "raise automatically". */
export function defaultStep(metric: Metric, prefs: UnitPrefs, target = 0): number {
  switch (metric) {
    case 'reps':
      return target >= 50 ? 5 : 2;
    case 'sets':
      return 1;
    case 'duration':
      return target >= 600 ? 60 : 15;
    case 'distance':
      return prefs.distanceUnit === 'km' ? 500 : METERS_PER_MILE / 2;
    case 'volume':
      return Math.max(1, Math.round(target * 0.05));
  }
}

export interface ProgressionCheck {
  /** The Monday of the week that was evaluated. */
  week: DayKey;
  raise: boolean;
  hit: number;
  needed: number;
}

/**
 * Evaluates last full week (Mon–Sun before this week) for a goal with auto-increase.
 * Per-day goals need ~70% of their scheduled days met (5 of 7 for a daily goal);
 * weekly goals need the week's total met. Returns null when there's nothing to evaluate.
 */
export function checkProgression(goal: Goal, sessions: Session[], today: DayKey): ProgressionCheck | null {
  if (goal.kind !== 'metric' || !goal.autoIncrease || goal.schedule.type === 'once') return null;
  const week = addDays(startOfWeek(today), -7);
  if (goal.autoIncrease.checkedWeek && goal.autoIncrease.checkedWeek >= week) return null;
  const end = addDays(week, 6);
  // Only judge weeks the goal fully covered.
  if (goal.startDate > week || (goal.endDate && goal.endDate < end)) return { week, raise: false, hit: 0, needed: 0 };

  if (goalPeriod(goal) === 'week') {
    const done = goalProgress(goal, week, sessions, {}).done;
    return { week, raise: done, hit: done ? 1 : 0, needed: 1 };
  }
  let scheduled = 0;
  let hit = 0;
  for (let d = week; d <= end; d = addDays(d, 1)) {
    if (!goalAppliesOn(goal, d)) continue;
    scheduled++;
    if (goalProgress(goal, d, sessions, {}).done) hit++;
  }
  const needed = Math.max(1, Math.ceil(scheduled * 0.7));
  return { week, raise: scheduled > 0 && hit >= needed, hit, needed };
}

// ---------- suggestions ----------

export interface GoalSuggestion {
  key: string;
  exerciseId: string;
  metric: Metric;
  target: number;
  schedule: Schedule;
  /** Why it's suggested, in plain words (numbers are formatted by the caller). */
  activeDays: number;
  typical: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Rounds a target up to a friendly number for its metric. */
export function niceTarget(value: number, metric: Metric, prefs: UnitPrefs): number {
  switch (metric) {
    case 'reps':
      return Math.max(5, Math.ceil(value / 5) * 5);
    case 'sets':
      return Math.max(1, Math.ceil(value));
    case 'duration':
      return Math.max(30, Math.ceil(value / 15) * 15);
    case 'distance': {
      const half = prefs.distanceUnit === 'km' ? 500 : METERS_PER_MILE / 2;
      return Math.max(half, Math.ceil(value / half) * half);
    }
    case 'volume':
      return Math.max(100, Math.ceil(value / 100) * 100);
  }
}

function suggestionMetric(exerciseId: string): Metric {
  switch (getExercise(exerciseId).kind) {
    case 'reps':
      return 'reps';
    case 'duration':
      return 'duration';
    case 'distance':
      return 'distance';
    case 'strength':
      return 'sets';
  }
}

/**
 * Goals worth adding, based on the last 28 days: exercises done often (12+ days) get a
 * daily target near their usual day; occasional ones (3+ days) get a weekly total.
 * Targets sit ~10% above what's typical, so they stretch without being out of reach.
 */
export function suggestGoals(sessions: Session[], goals: Goal[], today: DayKey, prefs: UnitPrefs, max = 3): GoalSuggestion[] {
  const start = addDays(today, -27);
  const covered = new Set(goals.filter((g) => g.kind === 'metric' && (!g.endDate || g.endDate >= today)).map((g) => g.exerciseId));
  const days = new Map<string, Set<DayKey>>();
  for (const s of sessions) {
    if (s.date < start || s.date > today) continue;
    for (const e of s.entries) {
      if (!days.has(e.exerciseId)) days.set(e.exerciseId, new Set());
      days.get(e.exerciseId)!.add(s.date);
    }
  }
  const out: GoalSuggestion[] = [];
  for (const [exerciseId, set] of days) {
    if (covered.has(exerciseId) || set.size < 3) continue;
    const metric = suggestionMetric(exerciseId);
    if (set.size >= 12) {
      const typical = median([...set].map((d) => totalInRange(sessions, d, d, exerciseId, metric)));
      out.push({ key: `${exerciseId}-daily`, exerciseId, metric, target: niceTarget(typical * 1.1, metric, prefs), schedule: { type: 'daily' }, activeDays: set.size, typical });
    } else {
      const typical = totalInRange(sessions, start, today, exerciseId, metric) / 4;
      out.push({ key: `${exerciseId}-weekly`, exerciseId, metric, target: niceTarget(typical * 1.1, metric, prefs), schedule: { type: 'weekly' }, activeDays: set.size, typical });
    }
  }
  return out.sort((a, b) => b.activeDays - a.activeDays).slice(0, max);
}
