/**
 * The main challenge: one overall rating from 0 to 100 for everyone in your groups.
 * In each running challenge the leader scores 100 and everyone else their share of the
 * leader's total; your rating is the average of your challenge scores. It moves whenever
 * anyone logs a workout.
 */
import { challengeState, groupLeaderboard, membersOf } from './groups';
import type { DayKey, Group, Person, Session, Settings } from './types';

export interface OverallRow {
  person: Person;
  /** 0…100. */
  rating: number;
  /** Challenges the rating is made of. */
  challenges: number;
  rank: number;
}

export function overallRatings(
  groups: Group[],
  people: Person[],
  me: Person,
  mine: Session[],
  others: Session[],
  settings: Settings,
  totals: Record<string, Record<string, number>>,
  today: DayKey,
): OverallRow[] {
  const scores = new Map<string, { person: Person; sum: number; n: number }>();
  for (const g of groups) {
    // Running challenges count; a group between challenges counts its latest finished one.
    const running = g.challenges.filter((c) => challengeState(c, today) === 'active');
    const latestEnded = [...g.challenges].filter((c) => challengeState(c, today) === 'ended').sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    const list = running.length ? running : latestEnded ? [latestEnded] : [];
    const members = membersOf(g, people, me);
    for (const c of list) {
      const rows = groupLeaderboard(g, c, members, mine, others, settings, totals).filter((r) => r.value !== null);
      if (rows.length < 1) continue;
      const top = Math.max(...rows.map((r) => r.value!));
      for (const r of rows) {
        const score = top > 0 ? (100 * r.value!) / top : 0;
        const e = scores.get(r.person.id) ?? { person: r.person, sum: 0, n: 0 };
        e.sum += score;
        e.n += 1;
        scores.set(r.person.id, e);
      }
    }
  }
  const rows = [...scores.values()]
    .map((e) => ({ person: e.person, rating: Math.round(e.sum / e.n), challenges: e.n, rank: 0 }))
    .sort((a, b) => b.rating - a.rating || b.challenges - a.challenges || a.person.name.localeCompare(b.person.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].rating === r.rating ? rows[i - 1].rank : i + 1));
  return rows;
}
