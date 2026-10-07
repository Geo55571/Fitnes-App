import { totalInRange } from './metrics';
import type { Challenge, DayKey, Group, Person, Session, Settings } from './types';

export const ME_ID = 'me';

export function selfPerson(name: string, color: string, settings: Settings): Person {
  return { id: ME_ID, name: name || 'You', color, sharing: settings.sharing, source: 'self' };
}

export function sessionsOf(personId: string, mine: Session[], others: Session[]): Session[] {
  return personId === ME_ID ? mine : others.filter((s) => s.personId === personId);
}

export type ChallengeState = 'upcoming' | 'active' | 'ended';

export function challengeState(c: Challenge, today: DayKey): ChallengeState {
  if (today < c.startDate) return 'upcoming';
  if (today > c.endDate) return 'ended';
  return 'active';
}

export interface LeaderRow {
  person: Person;
  /** null when the person doesn't share challenge results. */
  value: number | null;
  rank: number | null;
  /** For the local user: whether other members would see this row. */
  visibleToOthers?: boolean;
}

/**
 * Challenge standings from saved sessions. Members who keep activity private are listed
 * without a value and are not ranked. The local user always sees their own total, and is
 * flagged if their privacy settings hide it from others.
 */
export function leaderboard(
  challenge: Challenge,
  members: Person[],
  mine: Session[],
  others: Session[],
  settings: Settings,
  /** Synced totals by person id (members of synced groups). Missing = not shared. */
  remoteTotals?: Record<string, number>,
): LeaderRow[] {
  const rows: LeaderRow[] = members.map((p) => {
    const self = p.id === ME_ID;
    let value: number | null;
    if (self) {
      value = totalInRange(mine, challenge.startDate, challenge.endDate, challenge.exerciseId, challenge.metric);
    } else if (p.source === 'remote') {
      value = remoteTotals?.[p.id] ?? null;
    } else {
      value = p.sharing !== 'private'
        ? totalInRange(sessionsOf(p.id, mine, others), challenge.startDate, challenge.endDate, challenge.exerciseId, challenge.metric)
        : null;
    }
    return {
      person: p,
      value,
      rank: null,
      visibleToOthers: self ? settings.sharing !== 'private' && settings.showOnLeaderboards : undefined,
    };
  });
  const ranked = rows.filter((r) => r.value !== null).sort((a, b) => b.value! - a.value! || a.person.name.localeCompare(b.person.name));
  let rank = 0;
  let prev: number | null = null;
  ranked.forEach((r, i) => {
    if (r.value !== prev) rank = i + 1;
    r.rank = rank;
    prev = r.value;
  });
  return [...ranked, ...rows.filter((r) => r.value === null)];
}

export function activeChallenge(group: Group, today: DayKey): Challenge | undefined {
  return (
    group.challenges.find((c) => challengeState(c, today) === 'active') ??
    group.challenges.find((c) => challengeState(c, today) === 'upcoming')
  );
}

export function membersOf(group: Group, people: Person[], me: Person): Person[] {
  return group.memberIds
    .map((id) => (id === ME_ID ? me : people.find((p) => p.id === id)))
    .filter((p): p is Person => !!p);
}

export const SHARING_LABEL: Record<Person['sharing'], string> = {
  everything: 'Shares all activity',
  challenges: 'Shares challenge results only',
  private: 'Keeps activity private',
};

/**
 * Leaderboard for a group as shown in the app. Synced groups use members' synced totals,
 * and your own total excludes sample data (which is never uploaded).
 */
export function groupLeaderboard(
  group: Group,
  challenge: Challenge,
  members: Person[],
  mine: Session[],
  others: Session[],
  settings: Settings,
  totals: Record<string, Record<string, number>>,
): LeaderRow[] {
  const own = group.remote ? mine.filter((s) => !s.demo) : mine;
  return leaderboard(challenge, members, own, others, settings, totals[challenge.id]);
}
