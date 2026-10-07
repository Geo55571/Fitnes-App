/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addDays, dayKeyFor, msUntilNextMidnight, startOfWeek } from './dates';
import { leaderboard, ME_ID } from './groups';
import { currentStreak, dayTotal, goalAppliesOn, goalProgress, personalBests } from './metrics';
import type { Goal, Person, Session, Settings } from './types';
import { distanceToMeters, formatMetric, formatProgress, isComplete, kgToWeight, trimNumber, weightToKg } from './units';

const km = { distanceUnit: 'km', weightUnit: 'kg' } as const;
const mi = { distanceUnit: 'mi', weightUnit: 'lb' } as const;

function session(date: string, entries: Session['entries'], personId = ME_ID): Session {
  const at = `${date}T12:00:00.000Z`;
  return { id: `${personId}-${date}-${Math.random()}`, personId, date, performedAt: at, category: 'bodyweight', entries, createdAt: at, updatedAt: at };
}
const pushups = (reps: number[]) => ({ id: 'e', exerciseId: 'pushups', sets: reps.map((r) => ({ reps: r })) });

const dailyPushups: Goal = {
  id: 'g1',
  kind: 'metric',
  title: '',
  exerciseId: 'pushups',
  metric: 'reps',
  target: 10,
  schedule: { type: 'daily' },
  startDate: '2026-09-01',
  createdAt: '2026-09-01T00:00:00Z',
};

describe('goal progress', () => {
  it('sums multiple sessions in a day: 4 + 3 of 10 → 7/10', () => {
    const s = [session('2026-09-30', [pushups([4])]), session('2026-09-30', [pushups([3])])];
    const p = goalProgress(dailyPushups, '2026-09-30', s, {});
    assert.equal(p.value, 7);
    assert.equal(p.done, false);
    assert.deepEqual(formatProgress(p.value, p.target, 'reps', km), { value: '7', target: '10', unit: 'reps' });
  });

  it('starts fresh the next day while keeping history', () => {
    const s = [session('2026-09-30', [pushups([4, 3])])];
    assert.equal(goalProgress(dailyPushups, '2026-10-01', s, {}).value, 0);
    assert.equal(goalProgress(dailyPushups, '2026-09-30', s, {}).value, 7);
  });

  it('respects start/end dates and weekday schedules', () => {
    const retired = { ...dailyPushups, endDate: '2026-09-29' };
    assert.equal(goalAppliesOn(retired, '2026-09-29'), true);
    assert.equal(goalAppliesOn(retired, '2026-09-30'), false);
    const mwf: Goal = { ...dailyPushups, schedule: { type: 'weekdays', days: [1, 3, 5] } };
    assert.equal(goalAppliesOn(mwf, '2026-09-30'), true); // Wednesday
    assert.equal(goalAppliesOn(mwf, '2026-10-01'), false); // Thursday
  });

  it('never shows an incomplete value as reaching the target', () => {
    const target = distanceToMeters(5, 'km');
    const f = formatProgress(4996, target, 'distance', km);
    assert.equal(f.value, '4.99');
    assert.equal(f.target, '5');
    assert.equal(isComplete(4996, target), false);
  });

  it('treats unit round-trip float drift as complete', () => {
    const target = distanceToMeters(3.1, 'mi');
    const logged = distanceToMeters(1.55, 'mi') + distanceToMeters(1.55, 'mi');
    assert.equal(isComplete(logged, target), true);
  });
});

describe('units', () => {
  it('round-trips pounds without visible drift', () => {
    assert.equal(trimNumber(kgToWeight(weightToKg(135, 'lb'), 'lb'), 1), '135');
  });
  it('formats distance and duration', () => {
    assert.deepEqual(formatMetric(5000, 'distance', mi), { value: '3.11', unit: 'mi' });
    assert.deepEqual(formatMetric(100, 'duration', km), { value: '1:40', unit: '' });
    assert.deepEqual(formatMetric(1440, 'volume', km), { value: '1,440', unit: 'kg' });
  });
});

describe('dates', () => {
  it('computes day keys in the chosen zone', () => {
    const t = new Date('2026-09-30T22:30:00Z');
    assert.equal(dayKeyFor(t, 'Europe/Belgrade'), '2026-10-01');
    assert.equal(dayKeyFor(t, 'America/New_York'), '2026-09-30');
  });
  it('schedules the rollover at local midnight', () => {
    const ms = msUntilNextMidnight(new Date('2026-09-30T21:58:00Z'), 'Europe/Belgrade');
    assert.ok(ms > 119_000 && ms < 122_000, String(ms));
  });
  it('does calendar math across DST changes', () => {
    assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // EU DST ends Oct 25
    assert.equal(addDays('2026-03-08', 1), '2026-03-09'); // US DST starts
    assert.equal(startOfWeek('2026-10-04'), '2026-09-28');
  });
});

describe('records and streaks', () => {
  it('finds personal bests and streaks from saved sessions', () => {
    const s = [session('2026-09-28', [pushups([12, 8])]), session('2026-09-29', [pushups([15])]), session('2026-09-30', [pushups([5])])];
    const pbs = personalBests(s, 'pushups');
    assert.equal(pbs.find((p) => p.key === 'set')?.value, 15);
    assert.equal(pbs.find((p) => p.key === 'day')?.value, 20);
    assert.equal(currentStreak(s, '2026-09-30'), 3);
    assert.equal(currentStreak(s, '2026-10-01'), 3);
    assert.equal(currentStreak(s, '2026-10-02'), 0);
  });
});

describe('leaderboard', () => {
  const settings = { sharing: 'everything', showOnLeaderboards: true } as Settings;
  const people: Person[] = [
    { id: ME_ID, name: 'Me', color: '#000', sharing: 'everything', source: 'self' },
    { id: 'a', name: 'A', color: '#000', sharing: 'everything', source: 'demo' },
    { id: 'b', name: 'B', color: '#000', sharing: 'challenges', source: 'demo' },
    { id: 'c', name: 'C', color: '#000', sharing: 'private', source: 'demo' },
  ];
  const challenge = { id: 'x', title: 'x', exerciseId: 'pushups', metric: 'reps' as const, startDate: '2026-09-28', endDate: '2026-10-04', createdAt: '' };

  it('ranks from saved sessions and hides private members', () => {
    const mine = [session('2026-09-30', [pushups([10])])];
    const others = [
      session('2026-09-29', [pushups([20])], 'a'),
      session('2026-09-27', [pushups([99])], 'a'), // before the window
      session('2026-09-30', [pushups([10])], 'b'),
      session('2026-09-30', [pushups([50])], 'c'),
    ];
    const rows = leaderboard(challenge, people, mine, others, settings);
    assert.deepEqual(rows.map((r) => [r.person.id, r.value, r.rank]), [
      ['a', 20, 1],
      ['b', 10, 2],
      [ME_ID, 10, 2],
      ['c', null, null],
    ]);
  });

  it('flags the local user as hidden when privacy says so', () => {
    const rows = leaderboard(challenge, people, [], [], { ...settings, sharing: 'private' });
    assert.equal(rows.find((r) => r.person.id === ME_ID)?.visibleToOthers, false);
  });
});

describe('day totals', () => {
  it('ignores other exercises and other days', () => {
    const s = [session('2026-09-30', [pushups([5]), { id: 'r', exerciseId: 'running', distanceM: 3000 }]), session('2026-09-29', [pushups([9])])];
    assert.equal(dayTotal(s, '2026-09-30', 'pushups', 'reps'), 5);
    assert.equal(dayTotal(s, '2026-09-30', 'running', 'distance'), 3000);
  });
});

describe('trends', () => {
  it('compares this week so far with the same days last week', async () => {
    const { weekComparison, percentChange } = await import('./trends');
    // Wed 2026-09-30: current = Mon 28..Wed 30, previous = Mon 21..Wed 23 (Thu 24 excluded).
    const s = [
      session('2026-09-29', [pushups([30])]),
      session('2026-09-22', [pushups([20])]),
      session('2026-09-24', [pushups([99])]),
    ];
    const { rows } = weekComparison(s, '2026-09-30');
    assert.deepEqual(rows.map((r) => [r.exerciseId, r.current, r.previous]), [['pushups', 30, 20]]);
    assert.equal(percentChange(30, 20), 50);
    assert.equal(percentChange(5, 0), null);
  });

  it('counts sets per muscle group and ignores cardio', async () => {
    const { muscleSets } = await import('./trends');
    const s = [
      session('2026-09-30', [
        pushups([10, 10]),
        { id: 'p', exerciseId: 'plank', durationSec: 60 },
        { id: 'r', exerciseId: 'running', distanceM: 5000 },
      ]),
    ];
    const m = muscleSets(s, '2026-09-24', '2026-09-30');
    assert.equal(m.chest, 2);
    assert.equal(m.arms, 2);
    assert.equal(m.core, 1);
    assert.equal(m.legs, 0);
  });

  it('builds 1RM and pace trends from the best per day', async () => {
    const { exerciseTrend } = await import('./trends');
    const bench = (w: number, r: number) => ({ id: 'b', exerciseId: 'bench', sets: [{ reps: r, weightKg: w }] });
    const s = [session('2026-09-20', [bench(100, 1)]), session('2026-09-20', [bench(60, 10)]), session('2026-09-25', [bench(80, 5)])];
    const t = exerciseTrend(s, 'bench', '2026-09-30');
    assert.equal(t.format, 'weight');
    assert.deepEqual(t.points.map((p) => [p.date, Math.round(p.value * 10) / 10]), [['2026-09-20', 100], ['2026-09-25', 93.3]]);

    const run = (m: number, sec: number) => ({ id: 'r', exerciseId: 'running', distanceM: m, durationSec: sec });
    const r = exerciseTrend([session('2026-09-21', [run(5000, 1500)]), session('2026-09-21', [run(5000, 1400)]), session('2026-09-28', [run(10000, 3000)])], 'running', '2026-09-30');
    assert.equal(r.format, 'pace');
    assert.equal(r.lowerIsBetter, true);
    assert.deepEqual(r.points.map((p) => p.value), [280, 300]);

    // Bikes trend by speed (higher is better), and their records say "Top speed", not a pace.
    const ride = (m: number, sec: number) => ({ id: 'c', exerciseId: 'cycling', distanceM: m, durationSec: sec });
    const rides = [session('2026-09-21', [ride(20000, 3600)]), session('2026-09-28', [ride(27000, 3600)])];
    const c = exerciseTrend(rides, 'cycling', '2026-09-30');
    assert.equal(c.format, 'speed');
    assert.equal(c.lowerIsBetter, false);
    const { personalBests } = await import('./metrics');
    const { formatStat } = await import('./describe');
    const top = personalBests(rides, 'cycling').find((p) => p.key === 'speed')!;
    assert.equal(formatStat(top.value, top.format, { distanceUnit: 'km', weightUnit: 'kg' }), '27 km/h');
    assert.equal(personalBests(rides, 'cycling').some((p) => p.key === 'pace'), false);
  });
});

describe('pool distances', () => {
  it('shows swims in meters, not fractions of a kilometer', async () => {
    const { describeEntry } = await import('./describe');
    const swim = { id: 's', exerciseId: 'swimming', distanceM: 925, durationSec: 1179 };
    assert.equal(describeEntry(swim, { distanceUnit: 'km', weightUnit: 'kg' }), '925 m · 19:39 · 2:07 /100 m');
    assert.match(describeEntry(swim, { distanceUnit: 'mi', weightUnit: 'lb' }), /^1012 yd/);
  });
});

describe('backup', () => {
  it('round-trips, validates and skips damaged records', async () => {
    const { makeBackup, parseBackup } = await import('./backup');
    const good = session('2026-09-30', [pushups([5])]);
    const file = makeBackup({
      profile: { name: 'Sam', createdAt: '', onboarded: true },
      settings: {} as Settings,
      avatar: {} as never,
      trackers: [],
      sessions: [good, { ...good, id: 'bad', date: 'yesterday' } as Session],
      goals: [dailyPushups],
      goalChecks: {},
      groups: [],
      people: [],
      peopleSessions: [],
      demoLoaded: false,
      customExercises: [],
      routines: [],
    });
    const res = parseBackup(JSON.stringify(file));
    assert.ok(res.ok);
    if (res.ok) {
      assert.equal(res.data.sessions.length, 1);
      assert.equal(res.skipped, 1);
      assert.equal(res.data.goals.length, 1);
    }
    assert.equal(parseBackup('not json').ok, false);
    assert.equal(parseBackup('{"app":"other"}').ok, false);
  });

  it('merges without duplicates, keeping the newest edit', async () => {
    const { mergeBackup } = await import('./backup');
    const a = { ...session('2026-09-30', [pushups([5])]), id: 'x', updatedAt: '2026-09-30T10:00:00Z' };
    const newer = { ...a, entries: [pushups([9])], updatedAt: '2026-09-30T12:00:00Z' };
    const b = { ...session('2026-09-29', [pushups([3])]), id: 'y' };
    const base = { profile: {} as never, settings: {} as never, avatar: {} as never, trackers: [], goals: [], groups: [], people: [], peopleSessions: [], demoLoaded: false, customExercises: [], routines: [] };
    const merged = mergeBackup({ ...base, sessions: [a], goalChecks: { g: ['2026-09-29'] } }, { ...base, sessions: [newer, b], goalChecks: { g: ['2026-09-29', '2026-09-30'] } });
    assert.deepEqual(merged.sessions.map((x) => x.id).sort(), ['x', 'y']);
    assert.equal(dayTotal(merged.sessions, '2026-09-30', 'pushups', 'reps'), 9);
    assert.deepEqual(merged.goalChecks.g, ['2026-09-29', '2026-09-30']);
  });

  it('exports one CSV row per set in canonical units', async () => {
    const { sessionsToCsv } = await import('./backup');
    const csv = sessionsToCsv([
      session('2026-09-30', [
        { id: 'b', exerciseId: 'bench', sets: [{ reps: 8, weightKg: 60 }, { reps: 6, weightKg: 62.5 }] },
        { id: 'r', exerciseId: 'running', distanceM: 5210, durationSec: 1620 },
      ]),
    ]);
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, 4);
    assert.match(lines[1], /,Bench press,1,8,60,,,,,$/);
    assert.match(lines[3], /,Run,,,,5\.21,1620,,,$/);
  });
});

describe('smarter goals', () => {
  const weeklyRun: Goal = {
    ...dailyPushups,
    id: 'w',
    exerciseId: 'running',
    metric: 'distance',
    target: 20000,
    schedule: { type: 'weekly' },
  };
  const run = (date: string, m: number) => session(date, [{ id: 'r', exerciseId: 'running', distanceM: m }]);

  it('measures weekly goals Monday to Sunday and keeps them out of daily counts', async () => {
    const { daySummary } = await import('./metrics');
    const s = [run('2026-09-28', 8000), run('2026-09-30', 7000), run('2026-09-27', 50000)];
    const sum = daySummary([dailyPushups, weeklyRun], '2026-10-01', s, {});
    assert.equal(sum.total, 1);
    assert.equal(sum.weekly.length, 1);
    assert.equal(sum.weekly[0].value, 15000);
    assert.equal(sum.weekly[0].done, false);
  });

  it('raises a daily goal after 5 of 7 days, once per week', async () => {
    const { checkProgression } = await import('./goals');
    const g: Goal = { ...dailyPushups, autoIncrease: { step: 2 } };
    // Week of Sep 21–27: goal (10) met on 5 days.
    const s = ['21', '22', '23', '24', '25'].map((d) => session(`2026-09-${d}`, [pushups([10])]));
    const c = checkProgression(g, s, '2026-09-30');
    assert.deepEqual(c, { week: '2026-09-21', raise: true, hit: 5, needed: 5 });
    assert.equal(checkProgression({ ...g, autoIncrease: { step: 2, checkedWeek: '2026-09-21' } }, s, '2026-09-30'), null);
    const four = s.slice(0, 4);
    assert.equal(checkProgression(g, four, '2026-09-30')?.raise, false);
  });

  it('does not judge a week the goal did not fully cover', async () => {
    const { checkProgression } = await import('./goals');
    const fresh: Goal = { ...dailyPushups, startDate: '2026-09-24', autoIncrease: { step: 2 } };
    assert.equal(checkProgression(fresh, [], '2026-09-30')?.raise, false);
  });

  it('suggests daily targets for frequent exercises and weekly ones otherwise', async () => {
    const { suggestGoals } = await import('./goals');
    const s: Session[] = [];
    for (let i = 0; i < 14; i++) s.push(session(addDays('2026-09-30', -i * 2), [pushups([8, 9])]));
    for (let i = 0; i < 4; i++) s.push(run(addDays('2026-09-30', -i * 7), 5000));
    const out = suggestGoals(s, [], '2026-09-30', km);
    const p = out.find((x) => x.exerciseId === 'pushups')!;
    assert.equal(p.schedule.type, 'daily');
    assert.equal(p.target, 20); // typical 17 → +10% → round up to 5s
    const r = out.find((x) => x.exerciseId === 'running')!;
    assert.equal(r.schedule.type, 'weekly');
    assert.equal(r.target, 5500); // 5 km/week → 5.5 km
    assert.equal(suggestGoals(s, [dailyPushups], '2026-09-30', km).some((x) => x.exerciseId === 'pushups'), false);
  });
});

describe('reminders', () => {
  const baseSettings = {
    distanceUnit: 'km', weightUnit: 'kg', timeZone: 'Europe/Belgrade', reminderEnabled: true, reminderHour: 19, reminderMinute: 30,
    nudgeStreak: true, nudgeChallenges: true, weeklySummary: true, sharing: 'everything', showOnLeaderboards: true,
  } as Settings;
  const me: Person = { id: ME_ID, name: 'Sam', color: '#000', sharing: 'everything', source: 'self' };
  const input = (over: Record<string, unknown> = {}) => ({
    now: new Date('2026-09-30T10:00:00Z'), // 12:00 in Belgrade, Wednesday
    tz: 'Europe/Belgrade', today: '2026-09-30', settings: baseSettings, prefs: km,
    sessions: [] as Session[], goals: [] as Goal[], goalChecks: {}, groups: [], people: [], peopleSessions: [], me,
    ...over,
  });

  it('nudges tonight with exactly what is left, at local time', async () => {
    const { planReminders } = await import('./reminders');
    const plan = planReminders(input({ goals: [dailyPushups], sessions: [session('2026-09-30', [pushups([4, 3])])] }));
    const tonight = plan.find((n) => n.id === 'goal-2026-09-30')!;
    assert.equal(tonight.body, '3 push-ups to go today.');
    assert.equal(tonight.at.toISOString(), '2026-09-30T17:30:00.000Z'); // 19:30 CEST
    assert.equal(plan.filter((n) => n.id.startsWith('goal-')).length, 7);
  });

  it('skips the nudge when today is done, and handles DST', async () => {
    const { planReminders } = await import('./reminders');
    const plan = planReminders(input({ goals: [dailyPushups], sessions: [session('2026-09-30', [pushups([10])])] }));
    assert.equal(plan.some((n) => n.id === 'goal-2026-09-30'), false);
    const winter = planReminders(input({ now: new Date('2026-10-24T10:00:00Z'), today: '2026-10-24', goals: [dailyPushups] }));
    // Oct 25 is the DST switch; 19:30 local is 18:30 UTC afterwards.
    assert.equal(winter.find((n) => n.id === 'goal-2026-10-26')!.at.toISOString(), '2026-10-26T18:30:00.000Z');
  });

  it('warns about a streak only when nothing is logged today', async () => {
    const { planReminders } = await import('./reminders');
    const streak = ['27', '28', '29'].map((d) => session(`2026-09-${d}`, [pushups([5])]));
    const plan = planReminders(input({ sessions: streak }));
    assert.equal(plan.find((n) => n.id === 'streak-2026-09-30')?.title, '3-day streak');
    const logged = planReminders(input({ sessions: [...streak, session('2026-09-30', [pushups([1])])] }));
    assert.equal(logged.some((n) => n.id.startsWith('streak-')), false);
  });

  it('tells you your challenge standing on its last day', async () => {
    const { planReminders } = await import('./reminders');
    const alex: Person = { id: 'a', name: 'Alex', color: '#000', sharing: 'everything', source: 'demo' };
    const group = { id: 'g', name: 'The Crew', createdAt: '', memberIds: [ME_ID, 'a'], inviteCode: 'X', challenges: [
      { id: 'c', title: 'Push-up challenge', exerciseId: 'pushups', metric: 'reps' as const, startDate: '2026-09-28', endDate: '2026-10-04', createdAt: '' },
    ] };
    const plan = planReminders(input({
      groups: [group], people: [alex],
      sessions: [session('2026-09-29', [pushups([20])])],
      peopleSessions: [session('2026-09-29', [pushups([32])], 'a')],
    }));
    const n = plan.find((x) => x.id === 'challenge-c')!;
    assert.equal(n.body, 'Push-up challenge ends today. You’re #2, 12 reps behind Alex.');
    assert.equal(n.at.toISOString(), '2026-10-04T16:00:00.000Z');
  });
});
