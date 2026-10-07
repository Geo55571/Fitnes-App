/**
 * Core data model. All stored quantities are canonical:
 *   distance → meters, weight → kilograms, duration → seconds.
 * Conversion to the user's display units happens only at the UI edge (see units.ts).
 */

/** Calendar day in the user's time zone, formatted YYYY-MM-DD. */
export type DayKey = string;

export type Category = 'strength' | 'cardio' | 'bodyweight';

/** How an exercise is measured. */
export type ExerciseKind = 'strength' | 'reps' | 'duration' | 'distance';

export type Metric = 'reps' | 'sets' | 'volume' | 'distance' | 'duration';

export interface SetRow {
  reps: number;
  /** Only for strength exercises. */
  weightKg?: number;
}

/** Extra readings a watch reports for a workout (e.g. read from a photo of an Apple Watch summary). */
export interface WorkoutStats {
  activeKcal?: number;
  totalKcal?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  /** Canonical: meters. */
  elevationGainM?: number;
}

export interface Entry {
  id: string;
  exerciseId: string;
  /** strength + reps exercises */
  sets?: SetRow[];
  /** duration exercises (required) or cardio (optional) */
  durationSec?: number;
  /** cardio */
  distanceM?: number;
  /** Watch readings. Kept on this device: never uploaded to group sync. */
  stats?: WorkoutStats;
}

export interface Session {
  id: string;
  /** Owner. 'me' for the local user; demo people use their own ids. */
  personId: string;
  /** The user's local calendar day the session belongs to. */
  date: DayKey;
  /** ISO timestamp used for ordering within a day. */
  performedAt: string;
  category: Category;
  entries: Entry[];
  createdAt: string;
  updatedAt: string;
  /** Sample data — excluded from nothing, but removable in one step. */
  demo?: boolean;
  /** Downloaded from group sync (another member's session). */
  remote?: boolean;
  /** How it was logged; 'photo' = read from a workout photo. */
  source?: 'photo';
}

/** A saved workout template: exercises with their sets/targets, loaded into the editor in one tap. */
export interface Routine {
  id: string;
  name: string;
  category: Category;
  entries: Omit<Entry, 'id'>[];
  createdAt: string;
}

export type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] } // 0 = Sunday
  | { type: 'once'; date: DayKey }
  /** A Monday–Sunday total rather than a per-day target. */
  | { type: 'weekly' };

export interface Goal {
  id: string;
  kind: 'metric' | 'todo';
  /** For to-dos this is the task. For metric goals it is optional extra text. */
  title: string;
  exerciseId?: string;
  metric?: Metric;
  /** Canonical units. */
  target?: number;
  schedule: Schedule;
  startDate: DayKey;
  /** Inclusive. Set when a goal is retired or replaced by an edited revision. */
  endDate?: DayKey;
  createdAt: string;
  demo?: boolean;
  /** Raise the target by `step` (canonical units) after a strong week. */
  autoIncrease?: { step: number; checkedWeek?: DayKey };
}

export type SharingLevel = 'everything' | 'challenges' | 'private';

export interface Person {
  id: string;
  name: string;
  color: string;
  sharing: SharingLevel;
  /** 'self' = this device, 'demo' = local sample, 'remote' = would come from a sync service. */
  source: 'self' | 'demo' | 'remote';
}

export interface Challenge {
  id: string;
  title: string;
  exerciseId: string;
  metric: Metric;
  startDate: DayKey;
  endDate: DayKey;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
  memberIds: string[];
  inviteCode: string;
  challenges: Challenge[];
  demo?: boolean;
  /** Lives on the sync server (shared with real members). */
  remote?: boolean;
  /** For synced groups: whether you created it (can rename, delete, change the code). */
  isOwner?: boolean;
}

export type DistanceUnit = 'km' | 'mi';
export type WeightUnit = 'kg' | 'lb';

export type AvatarModelId = 'man-casual' | 'man-shorts' | 'man-hoodie' | 'woman-casual' | 'woman-adventurer';

export interface AvatarConfig {
  /** Which 3D character (body + outfit). */
  model: AvatarModelId;
  /** Starting physique; consistency adds to it over time. */
  build: 'lean' | 'regular' | 'muscular';
  skin: string;
  hairColor: string;
  /** null keeps the outfit's original colour. */
  topColor: string | null;
  bottomColor: string | null;
  shoeColor: string | null;
  badgeColor: string;
}

export interface TrackerConfig {
  exerciseId: string;
  metric: Metric;
}

export interface Settings {
  distanceUnit: DistanceUnit;
  weightUnit: WeightUnit;
  /** 'auto' follows the device. Otherwise an IANA zone, e.g. "Europe/Belgrade". */
  timeZone: string;
  /** Evening nudge with what's left of today's goals. */
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  /** Warn at 20:30 when a 3+ day streak would break. */
  nudgeStreak: boolean;
  /** Standing on the last day of a group challenge. */
  nudgeChallenges: boolean;
  /** Sunday evening summary. */
  weeklySummary: boolean;
  sharing: SharingLevel;
  showOnLeaderboards: boolean;
  /** Send workout photos to the cloud reader when this device can't read them. Off by default. */
  cloudPhotoReading: boolean;
}

export interface Profile {
  name: string;
  createdAt: string;
  onboarded: boolean;
  /** When the user last exported a backup file. */
  lastBackupAt?: string;
  /** Last day the avatar celebrated completing all daily goals (once per day). */
  celebratedOn?: DayKey;
}
