import { formatMonthDay, WEEKDAY_SHORT } from './dates';
import { getExercise, METRIC_LABEL } from './exercises';
import { describeSets } from './metrics';
import type { Entry, Goal, Schedule, Session } from './types';
import {
  formatDistance,
  formatDuration,
  formatMetricText,
  formatPaceOrSpeed,
  formatShortDistance,
  formatSpeed,
  formatWeight,
  kgToWeight,
  METERS_PER_MILE,
  speedStyle,
  trimNumber,
  type UnitPrefs,
} from './units';

export function describeEntry(entry: Entry, prefs: UnitPrefs): string {
  const main = describeMain(entry, prefs);
  const extra = describeStats(entry.stats);
  return extra ? `${main} · ${extra}` : main;
}

/** Watch readings, e.g. "320 kcal · avg 142 bpm". */
export function describeStats(stats: Entry['stats']): string {
  if (!stats) return '';
  const parts: string[] = [];
  if (stats.activeKcal) parts.push(`${stats.activeKcal} kcal`);
  else if (stats.totalKcal) parts.push(`${stats.totalKcal} kcal total`);
  if (stats.avgHeartRate) parts.push(`avg ${stats.avgHeartRate} bpm`);
  return parts.join(' · ');
}

function describeMain(entry: Entry, prefs: UnitPrefs): string {
  const ex = getExercise(entry.exerciseId);
  switch (ex.kind) {
    case 'strength': {
      const sets = entry.sets ?? [];
      const sameWeight = sets.every((s) => s.weightKg === sets[0]?.weightKg);
      const sameReps = sets.every((s) => s.reps === sets[0]?.reps);
      if (sets.length && sameWeight && sameReps) {
        return `${sets.length} × ${sets[0].reps} @ ${formatWeight(sets[0].weightKg ?? 0, prefs.weightUnit)}`;
      }
      const d = describeSets(entry);
      return `${d.sets} sets · ${d.reps} reps · top ${trimNumber(kgToWeight(d.topWeightKg, prefs.weightUnit), 1)} ${prefs.weightUnit}`;
    }
    case 'reps': {
      const d = describeSets(entry);
      return d.sets > 1 ? `${d.reps} reps · ${d.sets} sets` : `${d.reps} reps`;
    }
    case 'duration':
      // Workouts logged without a time (e.g. from Winter Arc) were still done.
      return entry.durationSec ? formatDuration(entry.durationSec) : 'Done';
    case 'distance': {
      if (!entry.distanceM && !entry.durationSec) return 'Done';
      // Indoor sessions can have a time but no distance.
      if (!entry.distanceM && entry.durationSec) return formatDuration(entry.durationSec);
      // Swims and rows are counted in meters (yards), not fractions of a km (mile).
      const short = speedStyle(entry.exerciseId) === 'pace100' && (entry.distanceM ?? 0) < 10000;
      const parts = [short ? formatShortDistance(entry.distanceM ?? 0, prefs.distanceUnit) : formatDistance(entry.distanceM ?? 0, prefs.distanceUnit)];
      if (entry.durationSec) {
        parts.push(formatDuration(entry.durationSec));
        const pace = formatPaceOrSpeed(entry.exerciseId, entry.distanceM ?? 0, entry.durationSec, prefs.distanceUnit);
        if (pace) parts.push(pace);
      }
      return parts.join(' · ');
    }
  }
}

export function describeSession(session: Session, prefs: UnitPrefs): string {
  return session.entries
    .map((e) => `${getExercise(e.exerciseId).name} ${describeEntry(e, prefs)}`)
    .join(', ');
}

export function scheduleLabel(s: Schedule): string {
  switch (s.type) {
    case 'daily':
      return 'Every day';
    case 'once':
      return formatMonthDay(s.date);
    case 'weekly':
      return 'Each week';
    case 'weekdays': {
      const sorted = [...s.days].sort();
      if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
      if (sorted.join() === '0,6') return 'Weekends';
      return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
    }
  }
}

export function goalTitle(goal: Goal, prefs: UnitPrefs): string {
  if (goal.kind === 'todo') return goal.title;
  const ex = getExercise(goal.exerciseId);
  const target = formatMetricText(goal.target ?? 0, goal.metric!, prefs);
  return goal.title?.trim() ? goal.title : `${ex.name} · ${target}`;
}

export function metricTitle(exerciseId: string, metric: Goal['metric']): string {
  const ex = getExercise(exerciseId);
  if (!metric) return ex.name;
  if (ex.kind === 'reps' && metric === 'reps') return ex.name;
  if (ex.kind === 'distance' && metric === 'distance') return ex.name;
  if (ex.kind === 'duration') return ex.name;
  return `${ex.name} ${METRIC_LABEL[metric].toLowerCase()}`;
}

export type StatFormat = 'reps' | 'weight' | 'volume' | 'distance' | 'duration' | 'pace' | 'pace100' | 'speed';

/** Formats a record or trend value; pace is stored as seconds per km, speed as meters per second. */
export function formatStat(value: number, format: StatFormat, prefs: UnitPrefs): string {
  switch (format) {
    case 'reps':
      return `${Math.round(value)} reps`;
    case 'weight':
      return formatWeight(value, prefs.weightUnit);
    case 'volume':
      return formatMetricText(value, 'volume', prefs);
    case 'distance':
      return formatDistance(value, prefs.distanceUnit);
    case 'duration':
      return formatDuration(value);
    case 'pace': {
      const perUnit = prefs.distanceUnit === 'km' ? value : value * (METERS_PER_MILE / 1000);
      return `${formatDuration(perUnit)} /${prefs.distanceUnit}`;
    }
    case 'pace100':
      return `${formatDuration(value / 10)} /100 m`;
    case 'speed':
      return formatSpeed(value, prefs.distanceUnit);
  }
}
