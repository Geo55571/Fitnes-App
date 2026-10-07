/**
 * The workout streak: days in a row with at least one workout, Duolingo-style. Today counts
 * once you've worked out; until then a streak through yesterday is still alive (and at risk).
 */
import { addDays } from './dates';
import type { DayKey, Session } from './types';

export interface Streak {
  /** Days in a row, ending today or yesterday. */
  current: number;
  /** Longest run ever. */
  best: number;
  /** Today already counts. */
  doneToday: boolean;
  /** Days without a workout since your first one (today not counted until it's over). */
  missed: number;
  /** Total days with a workout. */
  activeDays: number;
}

export function computeStreak(sessions: Session[], today: DayKey): Streak {
  const days = new Set(sessions.filter((s) => !s.demo && !s.remote && s.date <= today).map((s) => s.date));
  const doneToday = days.has(today);
  let current = 0;
  for (let d = doneToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) current++;

  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }

  let missed = 0;
  if (sorted.length) {
    for (let d = sorted[0]; d < today; d = addDays(d, 1)) if (!days.has(d)) missed++;
  }
  return { current, best: Math.max(best, current), doneToday, missed, activeDays: days.size };
}

export interface StreakStage {
  name: string;
  /** Streak length this stage starts at. */
  from: number;
  /** Flame colours: outer, middle, core. */
  colors: [string, string, string];
  glow: string;
}

/** The flame evolves as the streak grows. */
export const STREAK_STAGES: StreakStage[] = [
  { name: 'Ember', from: 0, colors: ['#B9BDC2', '#D5D8DB', '#ECEDEE'], glow: 'rgba(150,155,160,0.25)' },
  { name: 'Spark', from: 1, colors: ['#FF9F1C', '#FFC233', '#FFE8A3'], glow: 'rgba(255,159,28,0.35)' },
  { name: 'Flame', from: 3, colors: ['#FF6B1A', '#FF9F1C', '#FFE08A'], glow: 'rgba(255,107,26,0.4)' },
  { name: 'Blaze', from: 7, colors: ['#F03E1A', '#FF7A1A', '#FFD25A'], glow: 'rgba(240,62,26,0.45)' },
  { name: 'Inferno', from: 14, colors: ['#D7263D', '#FF4E1A', '#FFC93C'], glow: 'rgba(215,38,61,0.5)' },
  { name: 'Blue fire', from: 30, colors: ['#1E6BFF', '#3FA9FF', '#C9F0FF'], glow: 'rgba(30,107,255,0.5)' },
  { name: 'Cosmic', from: 60, colors: ['#7B2FF7', '#C04BFF', '#FFD1FF'], glow: 'rgba(123,47,247,0.55)' },
  { name: 'Legend', from: 100, colors: ['#E0A100', '#FFD700', '#FFFBE0'], glow: 'rgba(255,215,0,0.6)' },
];

export function streakStage(current: number): { stage: StreakStage; next: StreakStage | null } {
  let i = 0;
  while (i + 1 < STREAK_STAGES.length && current >= STREAK_STAGES[i + 1].from) i++;
  return { stage: STREAK_STAGES[i], next: STREAK_STAGES[i + 1] ?? null };
}
