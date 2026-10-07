import { getExercise, type Exercise } from './exercises';
import type {
  AvatarConfig,
  DayKey,
  Entry,
  Goal,
  Group,
  Person,
  Profile,
  Routine,
  Session,
  Settings,
  TrackerConfig,
} from './types';

/** Everything a user owns. Mirrors the persisted store state. */
export interface BackupData {
  profile: Profile;
  settings: Settings;
  avatar: AvatarConfig;
  trackers: TrackerConfig[];
  sessions: Session[];
  goals: Goal[];
  goalChecks: Record<string, DayKey[]>;
  groups: Group[];
  people: Person[];
  peopleSessions: Session[];
  demoLoaded: boolean;
  customExercises: Exercise[];
  routines: Routine[];
}

export interface BackupFile {
  app: 'FORM';
  format: 1;
  exportedAt: string;
  data: BackupData;
}

export function makeBackup(data: BackupData, now = new Date()): BackupFile {
  return { app: 'FORM', format: 1, exportedAt: now.toISOString(), data };
}

// ---------- validation ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isDay = (v: unknown): v is DayKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const optNum = (v: unknown) => v === undefined || isNum(v);

function validEntry(e: unknown): e is Entry {
  if (!isObj(e) || !isStr(e.id) || !isStr(e.exerciseId)) return false;
  if (!optNum(e.durationSec) || !optNum(e.distanceM)) return false;
  if (e.stats !== undefined && !(isObj(e.stats) && Object.values(e.stats).every(optNum))) return false;
  if (e.sets !== undefined) {
    if (!Array.isArray(e.sets)) return false;
    if (!e.sets.every((s) => isObj(s) && isNum(s.reps) && Number.isInteger(s.reps) && optNum(s.weightKg))) return false;
  }
  return true;
}

function validSession(s: unknown): s is Session {
  return (
    isObj(s) &&
    isStr(s.id) &&
    isStr(s.personId) &&
    isDay(s.date) &&
    isStr(s.performedAt) &&
    ['strength', 'cardio', 'bodyweight'].includes(s.category as string) &&
    Array.isArray(s.entries) &&
    s.entries.every(validEntry)
  );
}

function validGoal(g: unknown): g is Goal {
  if (!isObj(g) || !isStr(g.id) || !isDay(g.startDate) || !isObj(g.schedule)) return false;
  if (g.endDate !== undefined && !isDay(g.endDate)) return false;
  const t = (g.schedule as { type?: string }).type;
  if (!['daily', 'weekdays', 'once', 'weekly'].includes(t ?? '')) return false;
  if (g.kind === 'todo') return typeof g.title === 'string';
  return g.kind === 'metric' && isStr(g.exerciseId) && isStr(g.metric) && isNum(g.target) && g.target > 0;
}

function validGroup(g: unknown): g is Group {
  return isObj(g) && isStr(g.id) && typeof g.name === 'string' && Array.isArray(g.memberIds) && Array.isArray(g.challenges);
}

function validExercise(e: unknown): e is Exercise {
  return (
    isObj(e) &&
    isStr(e.id) &&
    isStr(e.name) &&
    ['strength', 'cardio', 'bodyweight'].includes(e.category as string) &&
    ['strength', 'reps', 'duration', 'distance'].includes(e.kind as string) &&
    isStr(e.icon) &&
    Array.isArray(e.muscles)
  );
}

function validRoutine(r: unknown): r is Routine {
  return (
    isObj(r) &&
    isStr(r.id) &&
    typeof r.name === 'string' &&
    ['strength', 'cardio', 'bodyweight'].includes(r.category as string) &&
    Array.isArray(r.entries) &&
    r.entries.every((e) => validEntry({ ...(e as object), id: 'x' }))
  );
}

function validPerson(p: unknown): p is Person {
  return isObj(p) && isStr(p.id) && typeof p.name === 'string';
}

export type ParseResult =
  | { ok: true; data: BackupData; skipped: number }
  | { ok: false; error: string };

/** Parses and validates a backup file. Malformed records are dropped and counted, never imported. */
export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file isn’t valid JSON.' };
  }
  if (!isObj(json) || json.app !== 'FORM' || !isObj(json.data)) {
    return { ok: false, error: 'This isn’t a FORM backup file.' };
  }
  if (json.format !== 1) return { ok: false, error: 'This backup was made by a newer version of FORM.' };
  const d = json.data;
  let skipped = 0;
  const keep = <T,>(arr: unknown, ok: (v: unknown) => v is T): T[] => {
    if (!Array.isArray(arr)) return [];
    const out = arr.filter(ok);
    skipped += arr.length - out.length;
    return out;
  };

  const goalChecks: Record<string, DayKey[]> = {};
  if (isObj(d.goalChecks)) {
    for (const [k, v] of Object.entries(d.goalChecks)) {
      if (Array.isArray(v)) goalChecks[k] = v.filter(isDay);
    }
  }

  const data: BackupData = {
    profile: (isObj(d.profile) ? d.profile : {}) as unknown as Profile,
    settings: (isObj(d.settings) ? d.settings : {}) as unknown as Settings,
    avatar: (isObj(d.avatar) ? d.avatar : {}) as unknown as AvatarConfig,
    trackers: Array.isArray(d.trackers)
      ? (d.trackers.filter((t) => isObj(t) && isStr(t.exerciseId) && isStr(t.metric)) as unknown as TrackerConfig[])
      : [],
    sessions: keep(d.sessions, validSession),
    goals: keep(d.goals, validGoal),
    goalChecks,
    groups: keep(d.groups, validGroup),
    people: keep(d.people, validPerson),
    peopleSessions: keep(d.peopleSessions, validSession),
    demoLoaded: d.demoLoaded === true,
    customExercises: keep(d.customExercises, validExercise),
    routines: keep(d.routines, validRoutine),
  };
  // `skipped` is only final after every list above has been filtered.
  return { ok: true, skipped, data };
}

// ---------- merge ----------

function byId<T extends { id: string }>(current: T[], incoming: T[], pick: (a: T, b: T) => T = (a) => a): T[] {
  const map = new Map(current.map((x) => [x.id, x]));
  for (const x of incoming) {
    const cur = map.get(x.id);
    map.set(x.id, cur ? pick(cur, x) : x);
  }
  return [...map.values()];
}

/**
 * Adds everything from a backup that isn't already here. For the same session, the more
 * recently edited copy wins. Profile, settings and avatar stay as they are on this device.
 */
export function mergeBackup(current: BackupData, incoming: BackupData): BackupData {
  const checks = { ...current.goalChecks };
  for (const [id, days] of Object.entries(incoming.goalChecks)) {
    checks[id] = [...new Set([...(checks[id] ?? []), ...days])];
  }
  return {
    ...current,
    sessions: byId(current.sessions, incoming.sessions, (a, b) => (b.updatedAt > a.updatedAt ? b : a)),
    goals: byId(current.goals, incoming.goals),
    goalChecks: checks,
    groups: byId(current.groups, incoming.groups, (a, b) => ({
      ...a,
      memberIds: [...new Set([...a.memberIds, ...b.memberIds])],
      challenges: byId(a.challenges, b.challenges),
    })),
    people: byId(current.people, incoming.people),
    peopleSessions: byId(current.peopleSessions, incoming.peopleSessions),
    demoLoaded: current.demoLoaded || incoming.demoLoaded,
    customExercises: byId(current.customExercises, incoming.customExercises),
    routines: byId(current.routines, incoming.routines),
  };
}

// ---------- CSV ----------

function csvCell(v: string | number | undefined): string {
  if (v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per set (or per cardio/plank entry), in canonical units so the file is unambiguous. */
export function sessionsToCsv(sessions: Session[]): string {
  const header = ['date', 'time_utc', 'session_id', 'category', 'exercise', 'set', 'reps', 'weight_kg', 'distance_km', 'duration_sec', 'active_kcal', 'avg_heart_rate', 'sample'];
  const rows: string[] = [header.join(',')];
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.performedAt.localeCompare(b.performedAt));
  for (const s of sorted) {
    for (const e of s.entries) {
      const base = [s.date, s.performedAt, s.id, s.category, getExercise(e.exerciseId).name];
      const tail = (dist?: number, dur?: number) => [
        dist !== undefined ? dist / 1000 : undefined,
        dur,
        e.stats?.activeKcal,
        e.stats?.avgHeartRate,
        s.demo ? 'yes' : '',
      ];
      if (e.sets?.length) {
        e.sets.forEach((set, i) => {
          rows.push([...base, i + 1, set.reps, set.weightKg, ...tail(undefined, undefined)].map(csvCell).join(','));
        });
      } else {
        rows.push([...base, undefined, undefined, undefined, ...tail(e.distanceM, e.durationSec)].map(csvCell).join(','));
      }
    }
  }
  return rows.join('\n') + '\n';
}
