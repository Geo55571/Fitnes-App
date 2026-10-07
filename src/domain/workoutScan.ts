/**
 * Workout photos → sessions.
 *
 * A photo of a watch's workout summary (e.g. Apple Watch "Outdoor Cycle · 35:12 · 7.24 km")
 * is read by an AI service (see functions/api/analyze.ts), which returns a `ScanReading`.
 * Nothing here trusts that reading: every value is checked for plausibility, converted to
 * canonical units, and mapped onto this app's exercises before anything is saved.
 * Any reader that returns this shape can be plugged in.
 */
import { addDays, zonedDateTime } from './dates';
import { getExercise } from './exercises';
import type { Category, DayKey, Entry, ExerciseKind, Session, WorkoutStats } from './types';
import { METERS_PER_MILE } from './units';

/** Activity types the reader chooses from. Anything else is 'other' plus the title shown. */
export const SCAN_ACTIVITIES = [
  'running',
  'walking',
  'hiking',
  'cycling',
  'swimming',
  'rowing',
  'elliptical',
  'hiit',
  'strength_training',
  'yoga',
  'other',
] as const;
export type ScanActivity = (typeof SCAN_ACTIVITIES)[number];

export const DISTANCE_UNITS = ['km', 'mi', 'm', 'yd'] as const;
export const ELEVATION_UNITS = ['m', 'ft'] as const;

/** One workout as read from the photo — raw, possibly wrong, in the units shown. */
export interface ScanWorkout {
  activity: ScanActivity;
  /** As displayed, e.g. "Outdoor Cycle". */
  title: string;
  duration_seconds: number | null;
  distance: { value: number; unit: (typeof DISTANCE_UNITS)[number] } | null;
  active_kcal: number | null;
  total_kcal: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  elevation_gain: { value: number; unit: (typeof ELEVATION_UNITS)[number] } | null;
  /** Local start time as shown, "HH:MM" (24 h). */
  start_time: string | null;
  /** YYYY-MM-DD when the photo shows a date. */
  date: string | null;
}

export interface ScanReading {
  /** False when the photo isn't a workout summary at all. */
  is_workout_summary: boolean;
  workouts: ScanWorkout[];
  /** Short explanation when nothing usable was found (blurry, cut off, not a workout…). */
  note: string | null;
}

const ACTIVITY_EXERCISE: Record<Exclude<ScanActivity, 'other'>, string> = {
  running: 'running',
  walking: 'walking',
  hiking: 'hiking',
  cycling: 'cycling',
  swimming: 'swimming',
  rowing: 'rowing',
  elliptical: 'elliptical',
  hiit: 'hiit',
  strength_training: 'strengthtraining',
  yoga: 'yoga',
};

/** A workout ready to save, or the reason it can't be. */
export interface PlannedWorkout {
  title: string;
  /** Existing exercise id, or null when a custom exercise named `customName` is needed. */
  exerciseId: string | null;
  customName?: string;
  /** Kind of the custom exercise to create (when exerciseId is null). */
  customKind?: ExerciseKind;
  category: Category;
  date: DayKey;
  performedAt: string;
  entry: Omit<Entry, 'id'>;
  /** Set when the same workout is already logged. */
  duplicateOf?: string;
}

export interface ScanPlan {
  workouts: PlannedWorkout[];
  /** Human-readable reasons for workouts that couldn't be used. */
  skipped: string[];
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Keeps a reading only inside a plausible range; anything else is treated as misread. */
const inRange = (v: unknown, min: number, max: number): number | undefined => (num(v) && v >= min && v <= max ? v : undefined);

function distanceMeters(d: ScanWorkout['distance']): number | undefined {
  if (!d || !num(d.value) || d.value <= 0) return undefined;
  const m = d.unit === 'km' ? d.value * 1000 : d.unit === 'mi' ? d.value * METERS_PER_MILE : d.unit === 'yd' ? d.value * 0.9144 : d.unit === 'm' ? d.value : NaN;
  return inRange(m, 1, 1_000_000);
}

function elevationMeters(e: ScanWorkout['elevation_gain']): number | undefined {
  if (!e || !num(e.value)) return undefined;
  return inRange(e.unit === 'ft' ? e.value * 0.3048 : e.unit === 'm' ? e.value : NaN, 0, 10_000);
}

/** The photo's date if it's believable (not in the future, within 30 days); otherwise today. */
function pickDate(raw: string | null, today: DayKey): DayKey {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today && raw >= addDays(today, -30)) return raw;
  return today;
}

function pickTime(raw: string | null, date: DayKey, tz: string, now: Date): string {
  const m = raw?.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 24 && min < 60) {
      const t = zonedDateTime(date, h, min, tz);
      if (t.getTime() <= now.getTime() + 5 * 60_000) return t.toISOString();
    }
  }
  return now.toISOString();
}

/** Same exercise, same day, about the same time and distance → it's already logged. */
export function findDuplicate(sessions: Session[], exerciseId: string, date: DayKey, entry: Omit<Entry, 'id'>): string | undefined {
  for (const s of sessions) {
    if (s.date !== date || s.demo) continue;
    for (const e of s.entries) {
      if (e.exerciseId !== exerciseId) continue;
      const sameTime = entry.durationSec && e.durationSec ? Math.abs(entry.durationSec - e.durationSec) <= 60 : !entry.durationSec && !e.durationSec;
      const sameDist =
        entry.distanceM && e.distanceM ? Math.abs(entry.distanceM - e.distanceM) <= Math.max(50, entry.distanceM * 0.02) : !entry.distanceM && !e.distanceM;
      if (sameTime && sameDist) return s.id;
    }
  }
  return undefined;
}

export function planScan(
  reading: ScanReading,
  ctx: { today: DayKey; tz: string; now: Date; sessions: Session[]; customNames?: Map<string, string> },
): ScanPlan {
  const plan: ScanPlan = { workouts: [], skipped: [] };
  if (!reading || !Array.isArray(reading.workouts)) return plan;

  for (const w of reading.workouts.slice(0, 10)) {
    const title = (typeof w.title === 'string' && w.title.trim().slice(0, 40)) || 'Workout';
    const durationSec = inRange(w.duration_seconds, 1, 24 * 3600);
    const distanceM = distanceMeters(w.distance);
    if (!durationSec && !distanceM) {
      plan.skipped.push(`${title}: no time or distance could be read`);
      continue;
    }

    // Exercise: a built-in one, an existing custom one with the same name, or a new custom one.
    const activity: ScanActivity = SCAN_ACTIVITIES.includes(w.activity) ? w.activity : 'other';
    let exerciseId: string | null = activity === 'other' ? null : ACTIVITY_EXERCISE[activity];
    let customName: string | undefined;
    let customKind: ExerciseKind | undefined;
    if (!exerciseId) {
      customName = title.replace(/^(indoor|outdoor)\s+/i, '').replace(/^\w/, (c) => c.toUpperCase());
      exerciseId = ctx.customNames?.get(customName.toLowerCase()) ?? null;
      customKind = distanceM ? 'distance' : 'duration';
    }
    const kind = exerciseId ? getExercise(exerciseId).kind : customKind!;
    const category: Category = exerciseId ? getExercise(exerciseId).category : 'cardio';

    // A timed-only exercise needs a time; distance sports accept either.
    if (kind === 'duration' && !durationSec) {
      plan.skipped.push(`${title}: no workout time could be read`);
      continue;
    }

    const stats: WorkoutStats = {};
    const active = inRange(w.active_kcal, 1, 10_000);
    const total = inRange(w.total_kcal, 1, 15_000);
    const avgHr = inRange(w.avg_heart_rate, 30, 240);
    const maxHr = inRange(w.max_heart_rate, 30, 250);
    const elev = elevationMeters(w.elevation_gain);
    if (active) stats.activeKcal = Math.round(active);
    if (total) stats.totalKcal = Math.round(total);
    if (avgHr) stats.avgHeartRate = Math.round(avgHr);
    if (maxHr && (!avgHr || maxHr >= avgHr)) stats.maxHeartRate = Math.round(maxHr);
    if (elev !== undefined) stats.elevationGainM = Math.round(elev);

    const entry: Omit<Entry, 'id'> = {
      exerciseId: exerciseId ?? '',
      ...(kind === 'distance' && distanceM ? { distanceM: Math.round(distanceM) } : {}),
      ...(durationSec ? { durationSec: Math.round(durationSec) } : {}),
      ...(Object.keys(stats).length ? { stats } : {}),
    };
    const date = pickDate(w.date, ctx.today);
    plan.workouts.push({
      title,
      exerciseId,
      customName: exerciseId ? undefined : customName,
      customKind: exerciseId ? undefined : customKind,
      category,
      date,
      performedAt: pickTime(w.start_time, date, ctx.tz, ctx.now),
      entry,
      duplicateOf: exerciseId ? findDuplicate(ctx.sessions, exerciseId, date, entry) : undefined,
    });
  }
  return plan;
}
