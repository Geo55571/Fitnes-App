import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Session } from './types';
import {
  ARC_TOTAL_DAYS,
  arcDayNumber,
  arcPhase,
  arcStatistics,
  arcWeekNumber,
  arcWeekStarts,
  dayInfo,
  EMPTY_WINTER_ARC,
  mergeWinterArc,
  parseWinterArc,
  patchDay,
  weekProgress,
  WINTER_ARC,
  type DailyChallengeEntry,
  type WinterArcData,
} from './winterArc';

const T = '2026-10-07T10:00:00.000Z';
const perfectDay: DailyChallengeEntry = { nutrition: { mark: 'done' }, discipline: { mark: 'done' }, reading: { minutes: 30 }, updatedAt: T };
const joined = (days: Record<string, DailyChallengeEntry> = {}, extra: Partial<WinterArcData> = {}): WinterArcData => ({
  ...EMPTY_WINTER_ARC,
  joinedAt: T,
  trackFrom: WINTER_ARC.start,
  days,
  ...extra,
});
const perfectRange = (from: string, to: string) => {
  const out: Record<string, DailyChallengeEntry> = {};
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) out[d.toISOString().slice(0, 10)] = perfectDay;
  return out;
};
const session = (id: string, date: string, category: Session['category'], exerciseId: string, extra: Partial<Session> = {}): Session => ({
  id,
  personId: 'me',
  date,
  performedAt: `${date}T08:00:00Z`,
  category,
  entries: [{ id: `${id}e`, exerciseId }],
  createdAt: T,
  updatedAt: T,
  ...extra,
});

describe('Winter Arc dates', () => {
  it('runs 124 days from Oct 1, 2026 to Feb 1, 2027', () => {
    assert.equal(ARC_TOTAL_DAYS, 124);
    assert.equal(arcDayNumber('2026-10-01'), 1);
    assert.equal(arcDayNumber('2026-11-05'), 36);
    assert.equal(arcDayNumber('2027-02-01'), 124);
    assert.equal(arcDayNumber('2026-09-30'), 0);
    assert.equal(arcDayNumber('2027-03-01'), 124);
    assert.equal(arcPhase('2026-09-30'), 'upcoming');
    assert.equal(arcPhase('2026-10-01'), 'active');
    assert.equal(arcPhase('2027-02-01'), 'active');
    assert.equal(arcPhase('2027-02-02'), 'finished');
  });

  it('splits the challenge into 19 Monday–Sunday weeks', () => {
    const weeks = arcWeekStarts();
    assert.equal(weeks.length, 19);
    assert.equal(weeks[0], '2026-09-28');
    assert.equal(weeks[18], '2027-02-01');
    assert.equal(arcWeekNumber('2026-10-04'), 1);
    assert.equal(arcWeekNumber('2026-10-05'), 2);
  });

  it('applies weekly minimums only to weeks with at least 4 tracked days', () => {
    const ctx = { data: joined(), sessions: [], today: '2027-02-01' };
    assert.equal(weekProgress('2026-09-28', ctx).trackedDays, 4); // Thu Oct 1 – Sun Oct 4
    assert.equal(weekProgress('2026-09-28', ctx).weeklyApplies, true);
    assert.equal(weekProgress('2027-02-01', ctx).trackedDays, 1);
    assert.equal(weekProgress('2027-02-01', ctx).weeklyApplies, false);
    // Started tracking on a Friday: that week's minimums don't apply.
    const late = { ...ctx, data: joined({}, { trackFrom: '2026-10-09' }) };
    assert.equal(weekProgress('2026-10-05', late).weeklyApplies, false);
  });
});

describe('Winter Arc days', () => {
  const today = '2026-10-07';
  it('classifies days', () => {
    const data = joined({
      '2026-10-01': perfectDay,
      '2026-10-02': { ...perfectDay, nutrition: { mark: 'exception', note: 'Birthday' } },
      '2026-10-03': { ...perfectDay, discipline: { mark: 'broken' } },
      '2026-10-04': { ...perfectDay, reading: { minutes: 12 } },
      '2026-10-06': { nutrition: { mark: 'exception' }, discipline: { mark: 'exception' }, reading: { minutes: 0, exception: true }, updatedAt: T },
      '2026-10-07': { nutrition: { mark: 'done' }, updatedAt: T },
    });
    const s = (d: string) => dayInfo(d, data, today).status;
    assert.equal(s('2026-10-01'), 'perfect');
    assert.equal(s('2026-10-02'), 'excused');
    assert.equal(dayInfo('2026-10-02', data, today).perfect, true);
    assert.equal(s('2026-10-03'), 'failed');
    assert.equal(s('2026-10-04'), 'partial');
    assert.equal(s('2026-10-05'), 'missed');
    assert.equal(s('2026-10-06'), 'excused');
    assert.equal(dayInfo('2026-10-06', data, today).perfect, false); // nothing actually completed
    assert.equal(s('2026-10-07'), 'partial');
    assert.equal(s('2026-10-08'), 'future');
    assert.equal(s('2026-09-30'), 'untracked');
  });

  it('marks days before joining or before the chosen start as untracked', () => {
    assert.equal(dayInfo('2026-10-03', EMPTY_WINTER_ARC, today).status, 'untracked');
    assert.equal(dayInfo('2026-10-03', joined({}, { trackFrom: '2026-10-05' }), today).status, 'untracked');
    assert.equal(dayInfo('2026-10-05', joined({}, { trackFrom: '2026-10-05' }), today).status, 'missed');
  });
});

describe('Winter Arc weeks', () => {
  const today = '2026-10-14'; // Wednesday of week 3
  const sessions = [
    session('s1', '2026-10-12', 'strength', 'bench'),
    session('s2', '2026-10-12', 'strength', 'deadlift'), // same day: still one workout
    session('s3', '2026-10-13', 'strength', 'strengthtraining'),
    session('s4', '2026-10-13', 'cardio', 'walking'), // walks don't count
    session('s5', '2026-10-14', 'cardio', 'running'),
    session('s6', '2026-10-14', 'strength', 'bench', { demo: true }), // sample data never counts
  ];

  it('counts one strength and one endurance workout per day', () => {
    const w = weekProgress('2026-10-12', { data: joined(perfectRange('2026-10-01', '2026-10-14')), sessions, today });
    assert.equal(w.index, 3);
    assert.equal(w.strength.count, 2);
    assert.equal(w.strength.met, true);
    assert.equal(w.endurance.count, 1);
    assert.equal(w.endurance.met, true);
    assert.equal(w.reading.done, 3);
    assert.equal(w.reading.due, 3);
    assert.equal(w.state, 'current');
    assert.equal(w.perfect, false); // not finished yet
  });

  it('counts workouts added in Winter Arc as their own kind', () => {
    const data = joined({}, { workouts: { s4: { kind: 'endurance', activity: 'other', name: 'Rowing' } } });
    const w = weekProgress('2026-10-12', { data, sessions, today });
    assert.equal(w.endurance.count, 2);
    assert.equal(w.endurance.workouts[0].name, 'Rowing');
    assert.equal(w.endurance.workouts[0].fromArc, true);
  });

  it('makes a finished week perfect only with every daily rule and both minimums', () => {
    const data = joined(perfectRange('2026-10-05', '2026-10-11'));
    const base = [session('a', '2026-10-05', 'strength', 'bench'), session('b', '2026-10-08', 'strength', 'bench')];
    const ctx = { data, today: '2026-10-12' };
    assert.equal(weekProgress('2026-10-05', { ...ctx, sessions: base }).perfect, false); // no endurance
    const full = [...base, session('c', '2026-10-10', 'cardio', 'cycling')];
    assert.equal(weekProgress('2026-10-05', { ...ctx, sessions: full }).perfect, true);
    // An approved exception covers a missing minimum.
    const excused = { ...data, weeks: { '2026-10-05': { endurance: { note: 'Sick' } } } };
    assert.equal(weekProgress('2026-10-05', { ...ctx, data: excused, sessions: base }).perfect, true);
  });
});

describe('Winter Arc streaks and statistics', () => {
  it('counts the current and longest streak, keeping a streak through yesterday alive', () => {
    const days = { ...perfectRange('2026-10-01', '2026-10-05'), ...perfectRange('2026-10-07', '2026-10-09') };
    const st = arcStatistics({ data: joined(days), sessions: [], today: '2026-10-10' });
    assert.equal(st.streaks.current, 3);
    assert.equal(st.streaks.longest, 5);
    assert.equal(st.perfectDays, 8);
    assert.equal(st.dayNumber, 10);
  });

  it('lets an all-exception day bridge a streak, and a broken rule today end it', () => {
    const days = {
      ...perfectRange('2026-10-01', '2026-10-03'),
      '2026-10-04': { nutrition: { mark: 'exception' as const }, discipline: { mark: 'exception' as const }, reading: { minutes: 0, exception: true }, updatedAt: T },
      '2026-10-05': perfectDay,
    };
    assert.equal(arcStatistics({ data: joined(days), sessions: [], today: '2026-10-06' }).streaks.current, 4);
    const broken = { ...days, '2026-10-06': { discipline: { mark: 'broken' as const }, updatedAt: T } };
    assert.equal(arcStatistics({ data: joined(broken), sessions: [], today: '2026-10-06' }).streaks.current, 0);
  });

  it('recalculates after an edit to a past day', () => {
    const days = perfectRange('2026-10-01', '2026-10-09');
    const before = arcStatistics({ data: joined(days), sessions: [], today: '2026-10-09' });
    const edited = { ...days, '2026-10-05': { ...perfectDay, reading: { minutes: 10 } } };
    const after = arcStatistics({ data: joined(edited), sessions: [], today: '2026-10-09' });
    assert.equal(before.streaks.current, 9);
    assert.equal(after.streaks.current, 4);
    assert.equal(after.streaks.longest, 4);
    assert.ok(after.score.value! < before.score.value!);
  });

  it('keeps completed, exception and violation counts apart and records events', () => {
    const days = {
      '2026-10-01': perfectDay,
      '2026-10-02': { ...perfectDay, nutrition: { mark: 'broken' as const, note: 'Chips at a party' } },
      '2026-10-03': { ...perfectDay, nutrition: { mark: 'exception' as const, note: 'Wedding' } },
    };
    const st = arcStatistics({ data: joined(days), sessions: [], today: '2026-10-04' });
    assert.deepEqual(st.counts.nutrition, { completed: 1, exceptions: 1, violations: 1, missed: 0 });
    assert.equal(st.events.length, 2);
    assert.equal(st.events[0].kind, 'exception');
    assert.equal(st.events[1].note, 'Chips at a party');
  });
});

describe('Discipline Score', () => {
  it('is empty before anything is due', () => {
    const st = arcStatistics({ data: joined(), sessions: [], today: '2026-10-01' });
    assert.equal(st.score.value, null);
    assert.equal(st.score.label, 'Not started');
  });

  it('is 90 × compliance + streak − recent misses', () => {
    const days = perfectRange('2026-10-01', '2026-10-04');
    const sessions = [session('a', '2026-10-01', 'strength', 'bench'), session('b', '2026-10-02', 'strength', 'bench'), session('c', '2026-10-03', 'cardio', 'running')];
    const perfect = arcStatistics({ data: joined(days), sessions, today: '2026-10-05' });
    assert.equal(perfect.score.compliance, 1);
    assert.equal(perfect.score.streakPoints, 4);
    assert.equal(perfect.score.value, 94);
    assert.equal(perfect.score.label, 'Locked in');

    // Reading 15 of 30 minutes on one day: half credit, the streak breaks, one recent miss.
    const half = { ...days, '2026-10-02': { ...perfectDay, reading: { minutes: 15 } } };
    const s = arcStatistics({ data: joined(half), sessions, today: '2026-10-05' }).score;
    const reading = s.components.find((c) => c.key === 'reading')!;
    assert.equal(reading.rate, 3.5 / 4);
    assert.equal(s.recentMisses, 1);
    assert.equal(s.streakPoints, 2);
    const expected = Math.round(90 * ((25 + 20 * 0.875 + 20 + 20 + 15) / 100) + 2 - 1);
    assert.equal(s.value, expected);
  });

  it('never counts approved exceptions as failures', () => {
    const days = { ...perfectRange('2026-10-01', '2026-10-04'), '2026-10-02': { ...perfectDay, nutrition: { mark: 'exception' as const } } };
    const s = arcStatistics({ data: joined(days), sessions: [], today: '2026-10-05' }).score;
    assert.equal(s.components.find((c) => c.key === 'nutrition')!.rate, 1);
    // Only the finished week 1 without workouts counts as recent misses (strength + endurance).
    assert.equal(s.recentMisses, 2);
  });

  it('is deterministic', () => {
    const ctx = { data: joined(perfectRange('2026-10-01', '2026-10-20')), sessions: [], today: '2026-10-21' };
    assert.deepEqual(arcStatistics(ctx).score, arcStatistics(ctx).score);
  });
});

describe('Winter Arc data', () => {
  it('drops empty days and trims notes', () => {
    assert.equal(patchDay(undefined, { reading: { minutes: 0 } }, T), null);
    const d = patchDay(undefined, { nutrition: { mark: 'broken', note: '  late snack  ' }, reading: { minutes: 31.6 } }, T)!;
    assert.deepEqual(d.nutrition, { mark: 'broken', note: 'late snack' });
    assert.equal(d.reading!.minutes, 32);
  });

  it('round-trips through a backup and merges by last edit', () => {
    const data = joined({ '2026-10-01': perfectDay }, { workouts: { s1: { kind: 'strength', name: 'Upper body' } }, weeks: { '2026-09-28': { strength: { note: 'Ill' } } } });
    const parsed = parseWinterArc(JSON.parse(JSON.stringify(data)));
    assert.deepEqual(parsed, data);
    assert.deepEqual(parseWinterArc({ days: { nope: 1, '2026-10-01': { nutrition: { mark: 'weird' } } } }), { ...EMPTY_WINTER_ARC });

    const newer = { ...perfectDay, reading: { minutes: 45 }, updatedAt: '2026-10-08T00:00:00.000Z' };
    const merged = mergeWinterArc(data, joined({ '2026-10-01': newer, '2026-10-02': perfectDay }));
    assert.equal(merged.days['2026-10-01'].reading!.minutes, 45);
    assert.ok(merged.days['2026-10-02']);
  });
});
