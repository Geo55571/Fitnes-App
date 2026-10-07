/**
 * SAMPLE DATA — clearly separated from real data.
 *
 * Everything created here is flagged `demo: true` (sessions, groups) or `source: 'demo'`
 * (people) and is removed by `clearDemo()` in the store (Settings → Sample data).
 * Sample people are not real users and nothing here is synced anywhere.
 */
import { addDays, diffDays, startOfWeek } from '@/domain/dates';
import type { Category, DayKey, Entry, Group, Person, Session } from '@/domain/types';

const ME = 'me';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Plan = (day: number, r: () => number) => { category: Category; entries: Omit<Entry, 'id'>[] } | null;

const reps = (n: number, count: number, r: () => number) =>
  Array.from({ length: count }, () => ({ reps: Math.max(1, Math.round(n + (r() - 0.5) * 4)) }));

const lifts = (kg: number, n: number, count: number) =>
  Array.from({ length: count }, () => ({ reps: n, weightKg: kg }));

const PLANS: Record<string, Plan[]> = {
  alex: [
    (_d, r) => ({ category: 'bodyweight', entries: [{ exerciseId: 'pushups', sets: reps(14, 3, r) }] }),
    (d, r) => (d % 2 ? { category: 'cardio', entries: [{ exerciseId: 'running', distanceM: 4000 + r() * 3000, durationSec: 1500 + r() * 900 }] } : null),
  ],
  jordan: [
    (d, r) => (d % 2 === 0 ? { category: 'bodyweight', entries: [{ exerciseId: 'pushups', sets: reps(11, 3, r) }] } : null),
    (d, r) => (d % 3 === 0 ? { category: 'cardio', entries: [{ exerciseId: 'cycling', distanceM: 15000 + r() * 12000, durationSec: 2700 + r() * 1800 }] } : null),
    (d) => (d % 3 === 1 ? { category: 'strength', entries: [{ exerciseId: 'deadlift', sets: lifts(120, 5, 3) }] } : null),
  ],
  taylor: [
    (d, r) => (d % 4 !== 3 ? { category: 'cardio', entries: [{ exerciseId: 'running', distanceM: 5000 + r() * 4000, durationSec: 1700 + r() * 1000 }] } : null),
    (d, r) => (d % 3 === 0 ? { category: 'bodyweight', entries: [{ exerciseId: 'pushups', sets: reps(9, 3, r) }] } : null),
  ],
  morgan: [
    (d, r) => (d % 2 === 1 ? { category: 'bodyweight', entries: [{ exerciseId: 'pullups', sets: reps(8, 3, r) }, { exerciseId: 'pushups', sets: reps(10, 2, r) }] } : null),
    (d) => (d % 2 === 0 ? { category: 'strength', entries: [{ exerciseId: 'bench', sets: lifts(70, 6, 4) }, { exerciseId: 'curl', sets: lifts(14, 10, 3) }] } : null),
  ],
  casey: [
    (d, r) => (d % 2 === 0 ? { category: 'cardio', entries: [{ exerciseId: 'cycling', distanceM: 18000 + r() * 15000, durationSec: 3000 + r() * 2400 }] } : null),
  ],
  me: [
    (d, r) => (d % 2 === 0 ? { category: 'bodyweight', entries: [{ exerciseId: 'pushups', sets: reps(8, 2, r) }, { exerciseId: 'plank', durationSec: Math.round(60 + r() * 60) }] } : null),
    (d, r) => (d % 3 === 1 ? { category: 'cardio', entries: [{ exerciseId: 'running', distanceM: Math.round(3000 + r() * 2500), durationSec: Math.round(1080 + r() * 900) }] } : null),
    (d) => (d % 4 === 2 ? { category: 'strength', entries: [{ exerciseId: 'bench', sets: lifts(55 + Math.floor((d % 28) / 7) * 2.5, 8, 3) }] } : null),
    (d, r) => (d % 5 === 3 ? { category: 'cardio', entries: [{ exerciseId: 'cycling', distanceM: Math.round(10000 + r() * 8000), durationSec: Math.round(1800 + r() * 1200) }] } : null),
  ],
};

const PEOPLE: Person[] = [
  { id: 'demo-alex', name: 'Alex', color: '#C9826B', sharing: 'everything', source: 'demo' },
  { id: 'demo-jordan', name: 'Jordan', color: '#5B7F6C', sharing: 'everything', source: 'demo' },
  { id: 'demo-taylor', name: 'Taylor', color: '#B08A5A', sharing: 'everything', source: 'demo' },
  { id: 'demo-morgan', name: 'Morgan', color: '#6A7394', sharing: 'challenges', source: 'demo' },
  { id: 'demo-casey', name: 'Casey', color: '#8A6A8C', sharing: 'private', source: 'demo' },
];

function round(e: Omit<Entry, 'id'>): Omit<Entry, 'id'> {
  return {
    ...e,
    distanceM: e.distanceM !== undefined ? Math.round(e.distanceM / 10) * 10 : undefined,
    durationSec: e.durationSec !== undefined ? Math.round(e.durationSec) : undefined,
  };
}

function generate(personId: string, planKey: string, today: DayKey, days: number, includeToday: boolean, seed: number): Session[] {
  const r = rng(seed);
  const out: Session[] = [];
  const now = Date.now();
  for (let i = days; i >= (includeToday ? 0 : 1); i--) {
    const date = addDays(today, -i);
    const dayIndex = diffDays(date, '2020-01-01');
    PLANS[planKey].forEach((plan, pIdx) => {
      const p = plan(dayIndex + pIdx, r);
      if (!p) return;
      const hoursBack = i === 0 ? 1 + pIdx * 2 + r() : 24 * i - 6 - pIdx * 2;
      const at = new Date(now - hoursBack * 3600 * 1000).toISOString();
      out.push({
        id: `demo-${personId}-${date}-${pIdx}`,
        personId,
        date,
        performedAt: at,
        category: p.category,
        entries: p.entries.map((e, k) => ({ ...round(e), id: `demo-${personId}-${date}-${pIdx}-${k}` })),
        createdAt: at,
        updatedAt: at,
        demo: true,
      });
    });
  }
  return out;
}

export function buildDemoData(today: DayKey) {
  const peopleSessions = PEOPLE.flatMap((p, i) =>
    generate(p.id, p.id.replace('demo-', ''), today, 27, true, 101 + i * 17),
  );
  const mySessions = generate(ME, 'me', today, 27, false, 7);

  const weekStart = startOfWeek(today);
  const group: Group = {
    id: 'demo-group-crew',
    name: 'The Crew',
    createdAt: new Date().toISOString(),
    memberIds: [ME, 'demo-alex', 'demo-jordan', 'demo-taylor', 'demo-morgan'],
    inviteCode: 'SAMPLE',
    demo: true,
    challenges: [
      {
        id: 'demo-ch-pushups',
        title: 'Push-up challenge',
        exerciseId: 'pushups',
        metric: 'reps',
        startDate: weekStart,
        endDate: addDays(weekStart, 6),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-ch-run',
        title: 'Running distance',
        exerciseId: 'running',
        metric: 'distance',
        startDate: addDays(today, -13),
        endDate: addDays(today, 14),
        createdAt: new Date().toISOString(),
      },
    ],
  };

  return { people: PEOPLE, peopleSessions, mySessions, groups: [group] };
}
