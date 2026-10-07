/**
 * Winter Arc 2026/27 — a personal, fixed-date challenge with five rules:
 *   daily:  healthy nutrition, 30 minutes of reading (a printed book), the personal discipline rule
 *   weekly: 2–4 strength workouts and 1–2 endurance sessions per calendar week (Monday–Sunday)
 *
 * Everything is entered by hand and kept on this device (never synced). Every number shown in the
 * Winter Arc screens — day status, weeks, streaks, statistics and the Discipline Score — is derived
 * here from the saved entries and the user's logged sessions, so an edit to any past day is
 * reflected everywhere at once. Pure functions only.
 */
import { addDays, diffDays, startOfWeek } from './dates';
import { getExercise } from './exercises';
import type { DayKey, Session } from './types';

// ---------- the challenge ----------

export interface Challenge {
  id: string;
  title: string;
  /** First day, inclusive. */
  start: DayKey;
  /** Last day, inclusive. */
  end: DayKey;
  readingMinutes: number;
  strength: { min: number; max: number };
  endurance: { min: number; max: number };
  /**
   * A calendar week needs at least this many tracked challenge days for the weekly minimums to
   * apply (so the single day Feb 1, 2027 — a Monday — doesn't demand two workouts).
   */
  minDaysForWeekly: number;
}

export const WINTER_ARC: Challenge = {
  id: 'winter-arc-2026-27',
  title: 'Winter Arc 2026/27',
  start: '2026-10-01',
  end: '2027-02-01',
  readingMinutes: 30,
  strength: { min: 2, max: 4 },
  endurance: { min: 1, max: 2 },
  minDaysForWeekly: 4,
};

/** 124 for Oct 1, 2026 → Feb 1, 2027. */
export const ARC_TOTAL_DAYS = diffDays(WINTER_ARC.end, WINTER_ARC.start) + 1;

// ---------- stored data ----------

/** How a rule went on a day. 'exception' = an approved exception (agreed with the others beforehand). */
export type ArcMark = 'done' | 'broken' | 'exception';

export interface ArcMarkEntry {
  mark: ArcMark;
  /** "What happened?" for a broken rule, the reason for an exception. Optional. */
  note?: string;
}

export interface ArcReading {
  minutes: number;
  book?: string;
  note?: string;
  /** Approved exception for the day's reading. */
  exception?: boolean;
}

/** One day's manual check-in. */
export interface DailyChallengeEntry {
  nutrition?: ArcMarkEntry;
  discipline?: ArcMarkEntry;
  reading?: ArcReading;
  /** When "Complete check-in" was pressed. */
  checkedInAt?: string;
  updatedAt: string;
}

export type ArcWorkoutKind = 'strength' | 'endurance';
export type EnduranceActivity = 'running' | 'jogging' | 'cycling' | 'other';

/** Winter Arc details for a workout. The workout itself is a normal FORM session (same id). */
export interface ArcWorkoutMeta {
  kind: ArcWorkoutKind;
  activity?: EnduranceActivity;
  name: string;
  note?: string;
}

export type ArcWeeklyRule = 'strength' | 'endurance';

/** An approved exception for a week's minimum, with its reason. */
export interface ChallengeException {
  note?: string;
}

export type ArcWeekEntry = Partial<Record<ArcWeeklyRule, ChallengeException>>;

export interface WinterArcData {
  /** Set when the user joins; null = not taking part. */
  joinedAt: string | null;
  /** First day that counts (Oct 1 unless the user chose to start later). */
  trackFrom: DayKey | null;
  days: Record<DayKey, DailyChallengeEntry>;
  /** Keyed by session id. */
  workouts: Record<string, ArcWorkoutMeta>;
  /** Keyed by the week's Monday. */
  weeks: Record<DayKey, ArcWeekEntry>;
}

export const EMPTY_WINTER_ARC: WinterArcData = { joinedAt: null, trackFrom: null, days: {}, workouts: {}, weeks: {} };

// ---------- labels ----------

export type ArcDailyRule = 'nutrition' | 'reading' | 'discipline';
export type ArcRule = ArcDailyRule | ArcWeeklyRule;

export const RULE_LABEL: Record<ArcRule, string> = {
  nutrition: 'Nutrition',
  reading: 'Reading',
  discipline: 'Discipline',
  strength: 'Strength',
  endurance: 'Endurance',
};

export const MARK_LABEL: Record<'nutrition' | 'discipline', Record<ArcMark, string>> = {
  nutrition: { done: 'Clean', broken: 'Broken', exception: 'Exception' },
  discipline: { done: 'Followed', broken: 'Broken', exception: 'Exception' },
};

export const ACTIVITY_LABEL: Record<EnduranceActivity, string> = {
  running: 'Running',
  jogging: 'Jogging',
  cycling: 'Cycling',
  other: 'Other',
};

// ---------- dates ----------

export type ArcPhase = 'upcoming' | 'active' | 'finished';

export function arcPhase(today: DayKey, c: Challenge = WINTER_ARC): ArcPhase {
  if (today < c.start) return 'upcoming';
  if (today > c.end) return 'finished';
  return 'active';
}

/** 1…124 during the challenge, 0 before it, 124 after it. */
export function arcDayNumber(today: DayKey, c: Challenge = WINTER_ARC): number {
  const total = diffDays(c.end, c.start) + 1;
  return Math.max(0, Math.min(total, diffDays(today, c.start) + 1));
}

export function isArcDay(d: DayKey, c: Challenge = WINTER_ARC): boolean {
  return d >= c.start && d <= c.end;
}

/** Mondays of every calendar week that overlaps the challenge (19 for 2026/27). */
export function arcWeekStarts(c: Challenge = WINTER_ARC): DayKey[] {
  const out: DayKey[] = [];
  for (let w = startOfWeek(c.start); w <= c.end; w = addDays(w, 7)) out.push(w);
  return out;
}

/** 1-based week number within the challenge. */
export function arcWeekNumber(day: DayKey, c: Challenge = WINTER_ARC): number {
  return Math.floor(diffDays(startOfWeek(day), startOfWeek(c.start)) / 7) + 1;
}

// ---------- workouts ----------

/** A strength or endurance workout as the challenge sees it. */
export interface WorkoutEntry {
  sessionId: string;
  date: DayKey;
  performedAt: string;
  kind: ArcWorkoutKind;
  activity?: EnduranceActivity;
  name: string;
  durationSec?: number;
  distanceM?: number;
  note?: string;
  /** Added in Winter Arc (editable there); otherwise logged elsewhere in FORM. */
  fromArc: boolean;
}

/** Exercises that count as endurance when logged elsewhere in the app (walks and hikes don't). */
const ENDURANCE_EXERCISES = new Set(['running', 'cycling']);

/** Which weekly rule a logged session counts for, if any. */
export function classifySession(s: Session, meta?: ArcWorkoutMeta): ArcWorkoutKind | null {
  if (meta) return meta.kind;
  if (s.category === 'strength') return 'strength';
  if (s.entries.some((e) => ENDURANCE_EXERCISES.has(e.exerciseId))) return 'endurance';
  return null;
}

/** The user's own workouts that count for the challenge, oldest first. Sample data never counts. */
export function arcWorkouts(sessions: Session[], data: WinterArcData, c: Challenge = WINTER_ARC): WorkoutEntry[] {
  const out: WorkoutEntry[] = [];
  for (const s of sessions) {
    if (s.demo || s.remote || !isArcDay(s.date, c)) continue;
    const meta = data.workouts[s.id];
    const kind = classifySession(s, meta);
    if (!kind) continue;
    const duration = s.entries.reduce((a, e) => a + (e.durationSec ?? 0), 0);
    const distance = s.entries.reduce((a, e) => a + (e.distanceM ?? 0), 0);
    const exercise = getExercise(s.entries[0]?.exerciseId);
    out.push({
      sessionId: s.id,
      date: s.date,
      performedAt: s.performedAt,
      kind,
      activity: meta?.activity ?? (kind === 'endurance' ? (exercise.id === 'cycling' ? 'cycling' : 'running') : undefined),
      name: meta?.name || (s.entries.length > 1 ? `${exercise.name} +${s.entries.length - 1}` : exercise.name),
      durationSec: duration || undefined,
      distanceM: distance || undefined,
      note: meta?.note,
      fromArc: !!meta,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.performedAt.localeCompare(b.performedAt));
}

// ---------- days ----------

/** 'open' = nothing entered yet; 'partial' = some reading, but under 30 minutes. */
export type RuleOutcome = 'done' | 'exception' | 'broken' | 'partial' | 'open';

function markOutcome(e?: ArcMarkEntry): RuleOutcome {
  return e ? e.mark : 'open';
}

export function readingOutcome(r: ArcReading | undefined, c: Challenge = WINTER_ARC): RuleOutcome {
  if (r?.exception) return 'exception';
  if (!r || r.minutes <= 0) return 'open';
  return r.minutes >= c.readingMinutes ? 'done' : 'partial';
}

export function dayOutcomes(e: DailyChallengeEntry | undefined, c: Challenge = WINTER_ARC): Record<ArcDailyRule, RuleOutcome> {
  return { nutrition: markOutcome(e?.nutrition), reading: readingOutcome(e?.reading, c), discipline: markOutcome(e?.discipline) };
}

/**
 * future    — after today (or after the challenge)
 * untracked — before the challenge or before the user started tracking
 * perfect   — every daily rule completed
 * excused   — every daily rule completed or covered by an approved exception (at least one exception)
 * failed    — a rule was broken
 * partial   — some rules done, others still open (past days: missed; today: in progress)
 * missed    — a past day with nothing entered
 * open      — today, nothing entered yet
 */
export type ArcDayStatus = 'future' | 'untracked' | 'perfect' | 'excused' | 'failed' | 'partial' | 'missed' | 'open';

export interface ArcDayInfo {
  date: DayKey;
  status: ArcDayStatus;
  outcomes: Record<ArcDailyRule, RuleOutcome>;
  /** All applicable daily rules completed (approved exceptions make a rule not applicable). */
  perfect: boolean;
  /** Every rule covered by an approved exception: neither builds nor breaks a streak. */
  allExcepted: boolean;
  entry?: DailyChallengeEntry;
}

export interface ArcContext {
  data: WinterArcData;
  sessions: Session[];
  today: DayKey;
  challenge?: Challenge;
}

/** First tracked day, or null when the user hasn't joined. */
export function trackStart(data: WinterArcData, c: Challenge = WINTER_ARC): DayKey | null {
  if (!data.joinedAt) return null;
  const from = data.trackFrom ?? c.start;
  return from < c.start ? c.start : from;
}

export function dayInfo(date: DayKey, data: WinterArcData, today: DayKey, c: Challenge = WINTER_ARC): ArcDayInfo {
  const entry = data.days[date];
  const outcomes = dayOutcomes(entry, c);
  const list = Object.values(outcomes);
  const allExcepted = list.every((o) => o === 'exception');
  const perfect = list.every((o) => o === 'done' || o === 'exception') && !allExcepted;
  const base = { date, outcomes, perfect, allExcepted, entry };
  const from = trackStart(data, c);
  if (date > today || date > c.end) return { ...base, perfect: false, allExcepted: false, status: 'future' };
  if (!from || date < from) return { ...base, perfect: false, allExcepted: false, status: 'untracked' };

  let status: ArcDayStatus;
  if (list.includes('broken')) status = 'failed';
  else if (perfect || allExcepted) status = list.includes('exception') ? 'excused' : 'perfect';
  else if (list.every((o) => o === 'open')) status = date === today ? 'open' : 'missed';
  else status = 'partial';
  return { ...base, status };
}

// ---------- weeks ----------

export interface WeeklyRuleProgress {
  /** Days in the week with a workout of this kind (one per day counts). */
  count: number;
  min: number;
  max: number;
  met: boolean;
  /** An approved exception covers this week's minimum. */
  excepted: boolean;
  exceptionNote?: string;
  workouts: WorkoutEntry[];
}

export interface DailyTally {
  done: number;
  /** Days that have been due so far (days with an approved exception left out). */
  due: number;
  exceptions: number;
}

export interface WeeklyProgress {
  index: number;
  /** Monday. */
  start: DayKey;
  /** First and last challenge day in this week. */
  from: DayKey;
  to: DayKey;
  days: ArcDayInfo[];
  trackedDays: number;
  /** The weekly minimums apply to this week. */
  weeklyApplies: boolean;
  /** The week's last challenge day is over. */
  finished: boolean;
  strength: WeeklyRuleProgress;
  endurance: WeeklyRuleProgress;
  nutrition: DailyTally;
  reading: DailyTally;
  discipline: DailyTally;
  perfectDays: number;
  /** Finished, every daily rule completed every day, and both weekly minimums met. */
  perfect: boolean;
  state: 'future' | 'untracked' | 'current' | 'complete' | 'incomplete';
}

function tally(days: ArcDayInfo[], rule: ArcDailyRule, today: DayKey): DailyTally {
  let done = 0;
  let due = 0;
  let exceptions = 0;
  for (const d of days) {
    if (d.status === 'future' || d.status === 'untracked') continue;
    const o = d.outcomes[rule];
    if (o === 'exception') exceptions++;
    else if (d.date < today || o === 'done' || o === 'broken') {
      due++;
      if (o === 'done') done++;
    }
  }
  return { done, due, exceptions };
}

export function weekProgress(weekStart: DayKey, ctx: ArcContext, workouts?: WorkoutEntry[]): WeeklyProgress {
  const c = ctx.challenge ?? WINTER_ARC;
  const monday = startOfWeek(weekStart);
  const sunday = addDays(monday, 6);
  const from = monday < c.start ? c.start : monday;
  const to = sunday > c.end ? c.end : sunday;
  const days: ArcDayInfo[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(dayInfo(d, ctx.data, ctx.today, c));

  const tracked = days.filter((d) => d.status !== 'untracked');
  const trackedDays = tracked.length;
  const weeklyApplies = trackedDays >= c.minDaysForWeekly;
  const finished = to < ctx.today;
  const start = trackStart(ctx.data, c);
  const all = workouts ?? arcWorkouts(ctx.sessions, ctx.data, c);
  const inWeek = all.filter((w) => w.date >= from && w.date <= to && !!start && w.date >= start && w.date <= ctx.today);
  const week = ctx.data.weeks[monday] ?? {};

  const rule = (kind: ArcWorkoutKind): WeeklyRuleProgress => {
    const list = inWeek.filter((w) => w.kind === kind);
    const count = new Set(list.map((w) => w.date)).size;
    const { min, max } = c[kind];
    return { count, min, max, met: count >= min, excepted: !!week[kind], exceptionNote: week[kind]?.note, workouts: list };
  };
  const strength = rule('strength');
  const endurance = rule('endurance');

  const perfectDays = days.filter((d) => d.perfect).length;
  const dailyClean = tracked.length > 0 && tracked.every((d) => d.perfect || d.allExcepted);
  const weeklyOk = !weeklyApplies || ((strength.met || strength.excepted) && (endurance.met || endurance.excepted));
  const perfect = finished && dailyClean && weeklyOk;

  let state: WeeklyProgress['state'];
  if (from > ctx.today) state = 'future';
  else if (!trackedDays) state = 'untracked';
  else if (!finished) state = 'current';
  else state = perfect ? 'complete' : 'incomplete';

  return {
    index: arcWeekNumber(monday, c),
    start: monday,
    from,
    to,
    days,
    trackedDays,
    weeklyApplies,
    finished,
    strength,
    endurance,
    nutrition: tally(days, 'nutrition', ctx.today),
    reading: tally(days, 'reading', ctx.today),
    discipline: tally(days, 'discipline', ctx.today),
    perfectDays,
    perfect,
    state,
  };
}

// ---------- streaks ----------

export interface ArcStreaks {
  current: number;
  longest: number;
}

/**
 * Days in a row with every daily rule completed. A day covered entirely by approved exceptions
 * neither adds to nor breaks a streak; a broken rule or a missed day ends it. Like the workout
 * streak, a streak through yesterday stays alive until today ends — unless a rule is broken today.
 */
export function arcStreaks(days: ArcDayInfo[], today: DayKey): ArcStreaks {
  const tracked = days.filter((d) => d.status !== 'untracked' && d.status !== 'future');
  let longest = 0;
  let run = 0;
  for (const d of tracked) {
    if (d.perfect) longest = Math.max(longest, ++run);
    else if (d.allExcepted) continue;
    else if (d.date !== today) run = 0;
  }
  let current = 0;
  for (let i = tracked.length - 1; i >= 0; i--) {
    const d = tracked[i];
    if (d.perfect) current++;
    else if (d.allExcepted) continue;
    else if (d.date === today && d.status !== 'failed') continue;
    else break;
  }
  return { current, longest };
}

// ---------- Discipline Score ----------

export type ScoreKey = 'nutrition' | 'reading' | 'discipline' | 'strength' | 'endurance';

/** Share of the 90 compliance points each rule carries. */
export const SCORE_WEIGHTS: Record<ScoreKey, number> = { nutrition: 25, reading: 20, discipline: 20, strength: 20, endurance: 15 };
export const COMPLIANCE_POINTS = 90;
export const STREAK_POINTS_MAX = 10;
export const MISS_PENALTY_MAX = 10;
/** Days looked back on for the "recent misses" penalty. */
export const RECENT_DAYS = 7;

export interface ScoreComponent {
  key: ScoreKey;
  weight: number;
  /** Credit earned (partial credit for reading under 30 minutes and weeks under the minimum). */
  earned: number;
  due: number;
  /** 0…1, or null when nothing has been due yet. */
  rate: number | null;
}

export interface DisciplineScore {
  /** 0…100, or null before anything has been due. */
  value: number | null;
  label: string;
  components: ScoreComponent[];
  /** Weighted average of the rule rates, 0…1. */
  compliance: number | null;
  compliancePoints: number;
  streakPoints: number;
  /** Broken or missed requirements in the last 7 days. */
  recentMisses: number;
  penalty: number;
}

export function scoreLabel(value: number | null): string {
  if (value === null) return 'Not started';
  if (value >= 90) return 'Locked in';
  if (value >= 75) return 'Strong';
  if (value >= 60) return 'Steady';
  if (value >= 40) return 'Slipping';
  return 'Off track';
}

/**
 * Discipline Score (0–100), fully deterministic:
 *
 *   compliance  = weighted average of each rule's rate so far
 *                 (nutrition 25 · reading 20 · discipline 20 · strength 20 · endurance 15;
 *                  rules with nothing due yet are left out and the rest re-weighted)
 *   score       = 90 × compliance
 *               + 1 point per day of the current streak (max 10)
 *               − 1 point per broken or missed requirement in the last 7 days (max 10)
 *
 * Rates: a daily rule's done days ÷ due days (reading earns minutes ÷ 30, up to 1, per day); a
 * weekly rule's workouts ÷ minimum (up to 1) per week, counted once the week is over or the
 * minimum is met. Approved exceptions are left out entirely: they never count as a failure.
 * Today counts only for what is already entered.
 */
export function disciplineScore(days: ArcDayInfo[], weeks: WeeklyProgress[], streak: number, today: DayKey, c: Challenge = WINTER_ARC): DisciplineScore {
  const acc: Record<ScoreKey, { earned: number; due: number }> = {
    nutrition: { earned: 0, due: 0 },
    reading: { earned: 0, due: 0 },
    discipline: { earned: 0, due: 0 },
    strength: { earned: 0, due: 0 },
    endurance: { earned: 0, due: 0 },
  };
  const recentFrom = addDays(today, -(RECENT_DAYS - 1));
  let recentMisses = 0;

  for (const d of days) {
    if (d.status === 'untracked' || d.status === 'future') continue;
    const past = d.date < today;
    for (const rule of ['nutrition', 'reading', 'discipline'] as const) {
      const o = d.outcomes[rule];
      if (o === 'exception') continue;
      // Today only counts once something is entered for the rule.
      if (!past && o !== 'done' && o !== 'broken') continue;
      acc[rule].due++;
      if (rule === 'reading') acc.reading.earned += Math.min(1, (d.entry?.reading?.minutes ?? 0) / c.readingMinutes);
      else if (o === 'done') acc[rule].earned++;
      if (o !== 'done' && d.date >= recentFrom) recentMisses++;
    }
  }
  for (const w of weeks) {
    if (!w.weeklyApplies) continue;
    for (const rule of ['strength', 'endurance'] as const) {
      const r = w[rule];
      if (r.excepted || !(w.finished || r.met)) continue;
      acc[rule].due++;
      acc[rule].earned += Math.min(1, r.count / r.min);
      if (!r.met && w.to >= addDays(today, -RECENT_DAYS)) recentMisses++;
    }
  }

  const components: ScoreComponent[] = (Object.keys(SCORE_WEIGHTS) as ScoreKey[]).map((key) => ({
    key,
    weight: SCORE_WEIGHTS[key],
    earned: acc[key].earned,
    due: acc[key].due,
    rate: acc[key].due ? acc[key].earned / acc[key].due : null,
  }));
  const counted = components.filter((x) => x.rate !== null);
  const weightSum = counted.reduce((a, x) => a + x.weight, 0);
  if (!weightSum) {
    return { value: null, label: scoreLabel(null), components, compliance: null, compliancePoints: 0, streakPoints: 0, recentMisses: 0, penalty: 0 };
  }
  const compliance = counted.reduce((a, x) => a + x.weight * x.rate!, 0) / weightSum;
  const compliancePoints = COMPLIANCE_POINTS * compliance;
  const streakPoints = Math.min(STREAK_POINTS_MAX, streak);
  const penalty = Math.min(MISS_PENALTY_MAX, recentMisses);
  const value = Math.max(0, Math.min(100, Math.round(compliancePoints + streakPoints - penalty)));
  return { value, label: scoreLabel(value), components, compliance, compliancePoints, streakPoints, recentMisses, penalty };
}

// ---------- statistics ----------

export interface RuleCounts {
  completed: number;
  exceptions: number;
  violations: number;
  /** Past days (or finished weeks) with the requirement not met and no exception. */
  missed: number;
}

/** A rule break or an approved exception, for the history list. */
export interface ChallengeEvent {
  id: string;
  date: DayKey;
  rule: ArcRule;
  kind: 'violation' | 'exception';
  note?: string;
  /** For weekly rules: the week's Monday. */
  week?: DayKey;
}

export interface ChallengeStatistics {
  phase: ArcPhase;
  dayNumber: number;
  totalDays: number;
  /** Days until Oct 1 (0 once it has started). */
  daysToStart: number;
  /** Share of the challenge's days that have passed, 0…1. */
  timeProgress: number;
  trackFrom: DayKey | null;
  days: ArcDayInfo[];
  weeks: WeeklyProgress[];
  workouts: WorkoutEntry[];
  today: ArcDayInfo | null;
  thisWeek: WeeklyProgress | null;
  streaks: ArcStreaks;
  perfectDays: number;
  perfectWeeks: number;
  /** Requirements fully met ÷ requirements due so far (exceptions left out), 0…1 or null. */
  completion: number | null;
  counts: Record<ArcRule, RuleCounts>;
  events: ChallengeEvent[];
  score: DisciplineScore;
}

/** Everything the Winter Arc screens show, computed in one pass. */
export function arcStatistics(ctx: ArcContext): ChallengeStatistics {
  const c = ctx.challenge ?? WINTER_ARC;
  const { data, today } = ctx;
  const workouts = arcWorkouts(ctx.sessions, data, c);
  const days: ArcDayInfo[] = [];
  for (let d = c.start; d <= c.end; d = addDays(d, 1)) days.push(dayInfo(d, data, today, c));
  const weeks = arcWeekStarts(c).map((w) => weekProgress(w, ctx, workouts));
  const streaks = arcStreaks(days, today);

  const counts = {} as Record<ArcRule, RuleCounts>;
  for (const r of Object.keys(RULE_LABEL) as ArcRule[]) counts[r] = { completed: 0, exceptions: 0, violations: 0, missed: 0 };
  const events: ChallengeEvent[] = [];
  let met = 0;
  let due = 0;

  for (const d of days) {
    if (d.status === 'untracked' || d.status === 'future') continue;
    for (const rule of ['nutrition', 'reading', 'discipline'] as const) {
      const o = d.outcomes[rule];
      const k = counts[rule];
      if (o === 'exception') {
        k.exceptions++;
        events.push({ id: `${d.date}:${rule}`, date: d.date, rule, kind: 'exception', note: rule === 'reading' ? d.entry?.reading?.note : d.entry?.[rule]?.note });
        continue;
      }
      if (o === 'done') k.completed++;
      else if (o === 'broken') {
        k.violations++;
        events.push({ id: `${d.date}:${rule}`, date: d.date, rule, kind: 'violation', note: rule !== 'reading' ? d.entry?.[rule]?.note : undefined });
      } else if (d.date < today) k.missed++;
      if (d.date < today || o === 'done' || o === 'broken') {
        due++;
        if (o === 'done') met++;
      }
    }
  }
  for (const w of weeks) {
    if (!w.weeklyApplies) continue;
    for (const rule of ['strength', 'endurance'] as const) {
      const r = w[rule];
      const k = counts[rule];
      if (r.excepted) {
        k.exceptions++;
        events.push({ id: `${w.start}:${rule}`, date: w.from, rule, kind: 'exception', note: r.exceptionNote, week: w.start });
        continue;
      }
      if (r.met) k.completed++;
      else if (w.finished) k.missed++;
      if (w.finished || r.met) {
        due++;
        if (r.met) met++;
      }
    }
  }
  events.sort((a, b) => b.date.localeCompare(a.date) || a.rule.localeCompare(b.rule));

  const inChallenge = isArcDay(today, c);
  return {
    phase: arcPhase(today, c),
    dayNumber: arcDayNumber(today, c),
    totalDays: diffDays(c.end, c.start) + 1,
    daysToStart: Math.max(0, diffDays(c.start, today)),
    timeProgress: arcDayNumber(today, c) / (diffDays(c.end, c.start) + 1),
    trackFrom: trackStart(data, c),
    days,
    weeks,
    workouts,
    today: inChallenge ? days.find((d) => d.date === today) ?? null : null,
    thisWeek: inChallenge ? weeks.find((w) => w.start === startOfWeek(today)) ?? null : null,
    streaks,
    perfectDays: days.filter((d) => d.perfect).length,
    perfectWeeks: weeks.filter((w) => w.perfect).length,
    completion: due ? met / due : null,
    counts,
    events,
    score: disciplineScore(days, weeks, streaks.current, today, c),
  };
}

// ---------- editing helpers ----------

const clean = (s: string | undefined) => (s && s.trim() ? s.trim().slice(0, 280) : undefined);

/** Applies a change to a day's entry; returns null when nothing is left in it. */
export function patchDay(prev: DailyChallengeEntry | undefined, patch: Partial<Omit<DailyChallengeEntry, 'updatedAt'>>, now: string): DailyChallengeEntry | null {
  const next: DailyChallengeEntry = { ...prev, ...patch, updatedAt: now };
  for (const k of ['nutrition', 'discipline'] as const) {
    const v = next[k];
    if (!v) delete next[k];
    else next[k] = { mark: v.mark, ...(clean(v.note) ? { note: clean(v.note) } : {}) };
  }
  if (next.reading) {
    const r = next.reading;
    const minutes = Math.max(0, Math.min(1440, Math.round(Number(r.minutes) || 0)));
    const reading: ArcReading = { minutes };
    if (clean(r.book)) reading.book = clean(r.book);
    if (clean(r.note)) reading.note = clean(r.note);
    if (r.exception) reading.exception = true;
    if (!minutes && !reading.book && !reading.note && !reading.exception) delete next.reading;
    else next.reading = reading;
  }
  if (!next.checkedInAt) delete next.checkedInAt;
  if (!next.nutrition && !next.discipline && !next.reading && !next.checkedInAt) return null;
  return next;
}

// ---------- backups ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDay = (v: unknown): v is DayKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const MARKS: ArcMark[] = ['done', 'broken', 'exception'];
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** Validates Winter Arc data from a backup file or an older save; anything malformed is dropped. */
export function parseWinterArc(v: unknown): WinterArcData {
  if (!isObj(v)) return EMPTY_WINTER_ARC;
  const days: Record<DayKey, DailyChallengeEntry> = {};
  if (isObj(v.days)) {
    for (const [date, raw] of Object.entries(v.days)) {
      if (!isDay(date) || !isObj(raw)) continue;
      const mark = (m: unknown): ArcMarkEntry | undefined =>
        isObj(m) && MARKS.includes(m.mark as ArcMark) ? { mark: m.mark as ArcMark, note: optStr(m.note) } : undefined;
      const r = raw.reading;
      const entry = patchDay(
        undefined,
        {
          nutrition: mark(raw.nutrition),
          discipline: mark(raw.discipline),
          reading: isObj(r) && typeof r.minutes === 'number' ? { minutes: r.minutes, book: optStr(r.book), note: optStr(r.note), exception: r.exception === true } : undefined,
          checkedInAt: optStr(raw.checkedInAt),
        },
        optStr(raw.updatedAt) ?? new Date(0).toISOString(),
      );
      if (entry) days[date] = entry;
    }
  }
  const workouts: Record<string, ArcWorkoutMeta> = {};
  if (isObj(v.workouts)) {
    for (const [id, m] of Object.entries(v.workouts)) {
      if (!isObj(m) || (m.kind !== 'strength' && m.kind !== 'endurance')) continue;
      const activity = ['running', 'jogging', 'cycling', 'other'].includes(m.activity as string) ? (m.activity as EnduranceActivity) : undefined;
      workouts[id] = { kind: m.kind, name: optStr(m.name) ?? '', ...(activity ? { activity } : {}), ...(optStr(m.note) ? { note: optStr(m.note) } : {}) };
    }
  }
  const weeks: Record<DayKey, ArcWeekEntry> = {};
  if (isObj(v.weeks)) {
    for (const [monday, w] of Object.entries(v.weeks)) {
      if (!isDay(monday) || !isObj(w)) continue;
      const entry: ArcWeekEntry = {};
      for (const rule of ['strength', 'endurance'] as const) if (isObj(w[rule])) entry[rule] = { note: optStr((w[rule] as Record<string, unknown>).note) };
      if (entry.strength || entry.endurance) weeks[monday] = entry;
    }
  }
  return {
    joinedAt: optStr(v.joinedAt) ?? null,
    trackFrom: isDay(v.trackFrom) ? v.trackFrom : null,
    days,
    workouts,
    weeks,
  };
}

/** Merges a backup into this device's data: the more recently edited copy of each day wins. */
export function mergeWinterArc(current: WinterArcData, incoming: WinterArcData): WinterArcData {
  const days = { ...current.days };
  for (const [d, e] of Object.entries(incoming.days)) if (!days[d] || e.updatedAt > days[d].updatedAt) days[d] = e;
  const trackFrom =
    current.trackFrom && incoming.trackFrom ? (current.trackFrom < incoming.trackFrom ? current.trackFrom : incoming.trackFrom) : current.trackFrom ?? incoming.trackFrom;
  return {
    joinedAt: current.joinedAt ?? incoming.joinedAt,
    trackFrom,
    days,
    workouts: { ...incoming.workouts, ...current.workouts },
    weeks: { ...incoming.weeks, ...current.weeks },
  };
}

// ---------- sharing with group-mates ----------

/**
 * What group-mates see of one Winter Arc day: whether it was completed and how many of the daily
 * rules were done — never which ones (the discipline rule stays private).
 */
export interface ArcSharedDay {
  date: DayKey;
  done: number;
  total: number;
  complete: boolean;
}

/** The days to share: every tracked day up to today that is past or has a check-in. */
export function arcSharedDays(stats: ChallengeStatistics, today: DayKey): ArcSharedDay[] {
  const out: ArcSharedDay[] = [];
  for (const d of stats.days) {
    if (d.status === 'future' || d.status === 'untracked') continue;
    if (d.date === today && !d.entry) continue;
    const list = Object.values(d.outcomes);
    out.push({ date: d.date, done: list.filter((o) => o === 'done' || o === 'exception').length, total: list.length, complete: d.perfect || d.allExcepted });
  }
  return out;
}

export interface ArcMemberSummary {
  /** Today's shared day, if they checked in. */
  today: ArcSharedDay | null;
  streak: number;
  perfectDays: number;
}

/** A group-mate's progress from what they share. Their streak through yesterday stays alive until today ends. */
export function arcMemberSummary(days: ArcSharedDay[], today: DayKey): ArcMemberSummary {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const todayDay = byDate.get(today) ?? null;
  let streak = 0;
  for (let d = todayDay?.complete ? today : addDays(today, -1); byDate.get(d)?.complete; d = addDays(d, -1)) streak++;
  return { today: todayDay, streak, perfectDays: days.filter((d) => d.complete).length };
}
