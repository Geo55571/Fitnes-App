import { addDays } from '../domain/dates';
import { ME_ID } from '../domain/groups';
import { totalInRange } from '../domain/metrics';
import type { Challenge, DayKey, Group, Metric, Person, Session, SharingLevel } from '../domain/types';

/**
 * Group sync, independent of any SDK. `Remote` is implemented with Supabase in remote.ts
 * and with an in-memory fake in tests. One `syncOnce` pass pushes this device's state and
 * pulls everything shared with you.
 */

// ---------- server rows ----------

export interface ProfileRow {
  id: string;
  display_name: string;
  color: string;
  sharing: SharingLevel;
  show_on_leaderboards: boolean;
}

export interface ChallengeRow {
  id: string;
  group_id: string;
  title: string;
  exercise_id: string;
  metric: Metric;
  start_date: DayKey;
  end_date: DayKey;
  created_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
  member_ids: string[];
  challenges: ChallengeRow[];
}

export interface SessionRow {
  user_id: string;
  id: string;
  date: DayKey;
  performed_at: string;
  category: Session['category'];
  entries: Session['entries'];
  updated_at: string;
}

export interface TotalRow {
  challenge_id: string;
  user_id: string;
  value: number;
}

export interface Remote {
  upsertProfile(p: ProfileRow): Promise<void>;
  listMyGroups(): Promise<GroupRow[]>;
  listProfiles(ids: string[]): Promise<ProfileRow[]>;
  listTotals(challengeIds: string[]): Promise<TotalRow[]>;
  listSessions(userIds: string[], sinceDate: DayKey): Promise<SessionRow[]>;
  upsertSessions(rows: Omit<SessionRow, 'user_id'>[]): Promise<void>;
  deleteSessions(ids: string[]): Promise<void>;
  deleteAllMySessions(): Promise<void>;
  upsertTotals(rows: Omit<TotalRow, 'user_id'>[]): Promise<void>;
  deleteMyTotals(challengeIds: string[]): Promise<void>;
  createGroup(name: string): Promise<GroupRow>;
  joinGroup(code: string): Promise<GroupRow>;
  leaveGroup(groupId: string): Promise<void>;
  deleteGroup(groupId: string): Promise<void>;
  renameGroup(groupId: string, name: string): Promise<void>;
  regenerateInvite(groupId: string): Promise<string>;
  createChallenge(groupId: string, c: Omit<Challenge, 'id' | 'createdAt'>): Promise<void>;
  deleteChallenge(challengeId: string): Promise<void>;
}

// ---------- local side ----------

export interface LocalSnapshot {
  name: string;
  color: string;
  sharing: SharingLevel;
  showOnLeaderboards: boolean;
  /** The user's own sessions (sample sessions are never uploaded). */
  sessions: Session[];
  today: DayKey;
}

/** What has been uploaded, so each pass only sends changes. Persisted per account. */
export interface PushState {
  sessions: Record<string, string>; // id → updatedAt
  cleared: boolean; // own sessions removed from the server after leaving "everything"
}

export const EMPTY_PUSH: PushState = { sessions: {}, cleared: false };

/** Days of own history uploaded for group-mates' Today / Yesterday / Last week views. */
export const UPLOAD_DAYS = 35;
/** Days of group-mates' history downloaded. */
export const DOWNLOAD_DAYS = 8;

export interface Standing {
  groupName: string;
  challengeTitle: string;
  rank: number;
  aheadOfMe: string[]; // person ids ranked above me
}

export interface SyncResult {
  groups: Group[];
  people: Person[];
  peopleSessions: Session[];
  challengeTotals: Record<string, Record<string, number>>;
  push: PushState;
  standings: Record<string, Standing>; // by challenge id
}

export function toGroup(row: GroupRow, userId: string): Group {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    inviteCode: row.invite_code,
    memberIds: row.member_ids.map((id) => (id === userId ? ME_ID : id)),
    challenges: row.challenges.map((c) => ({
      id: c.id,
      title: c.title,
      exerciseId: c.exercise_id,
      metric: c.metric,
      startDate: c.start_date,
      endDate: c.end_date,
      createdAt: c.created_at,
    })),
    remote: true,
    isOwner: row.owner_id === userId,
  };
}

export async function syncOnce(remote: Remote, userId: string, local: LocalSnapshot, prev: PushState): Promise<SyncResult> {
  const own = local.sessions.filter((s) => !s.demo && !s.remote);

  // 1) Profile.
  await remote.upsertProfile({
    id: userId,
    display_name: local.name.slice(0, 40),
    color: /^#[0-9A-Fa-f]{6}$/.test(local.color) ? local.color : '#1F4B39',
    sharing: local.sharing,
    show_on_leaderboards: local.showOnLeaderboards,
  });

  // 2) Own sessions — only when sharing everything; otherwise make sure none remain.
  let push: PushState;
  if (local.sharing === 'everything') {
    const since = addDays(local.today, -(UPLOAD_DAYS - 1));
    const window = own.filter((s) => s.date >= since);
    const changed = window.filter((s) => prev.sessions[s.id] !== s.updatedAt);
    if (changed.length) {
      await remote.upsertSessions(
        changed.map((s) => ({
          id: s.id,
          date: s.date,
          performed_at: s.performedAt,
          category: s.category,
          // Calories and heart rate are health data: they stay on this device.
          entries: s.entries.map(({ stats: _stats, ...e }) => e),
          updated_at: s.updatedAt,
        })),
      );
    }
    const keep = new Set(window.map((s) => s.id));
    const removed = Object.keys(prev.sessions).filter((id) => !keep.has(id));
    if (removed.length) await remote.deleteSessions(removed);
    push = { sessions: Object.fromEntries(window.map((s) => [s.id, s.updatedAt])), cleared: false };
  } else {
    if (!prev.cleared || Object.keys(prev.sessions).length) await remote.deleteAllMySessions();
    push = { sessions: {}, cleared: true };
  }

  // 3) Groups and challenge totals (own totals are computed here, from saved sessions).
  const groupRows = await remote.listMyGroups();
  const challenges = groupRows.flatMap((g) => g.challenges);
  if (challenges.length) {
    if (local.sharing !== 'private' && local.showOnLeaderboards) {
      await remote.upsertTotals(
        challenges.map((c) => ({ challenge_id: c.id, value: totalInRange(own, c.start_date, c.end_date, c.exercise_id, c.metric) })),
      );
    } else {
      await remote.deleteMyTotals(challenges.map((c) => c.id));
    }
  }

  // 4) Pull what members share.
  const memberIds = [...new Set(groupRows.flatMap((g) => g.member_ids))].filter((id) => id !== userId);
  const profiles = memberIds.length ? await remote.listProfiles(memberIds) : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const people: Person[] = memberIds.map((id) => {
    const p = byId.get(id);
    return {
      id,
      name: p?.display_name?.trim() || 'Member',
      color: p?.color ?? '#8C908C',
      sharing: p?.sharing ?? 'private',
      source: 'remote',
    };
  });

  const totalRows = challenges.length ? await remote.listTotals(challenges.map((c) => c.id)) : [];
  const challengeTotals: Record<string, Record<string, number>> = {};
  for (const t of totalRows) {
    if (t.user_id === userId) continue;
    (challengeTotals[t.challenge_id] ??= {})[t.user_id] = t.value;
  }

  const sharers = people.filter((p) => p.sharing === 'everything').map((p) => p.id);
  const sessionRows = sharers.length ? await remote.listSessions(sharers, addDays(local.today, -(DOWNLOAD_DAYS - 1))) : [];
  const peopleSessions: Session[] = sessionRows.map((r) => ({
    id: `${r.user_id}:${r.id}`,
    personId: r.user_id,
    date: r.date,
    performedAt: r.performed_at,
    category: r.category,
    entries: r.entries,
    createdAt: r.performed_at,
    updatedAt: r.updated_at,
    remote: true,
  }));

  // 5) Standings, so the app can tell you when someone passes you.
  const groups = groupRows.map((g) => toGroup(g, userId));
  const standings: Record<string, Standing> = {};
  for (const g of groupRows) {
    for (const c of g.challenges) {
      if (local.today < c.start_date || local.today > c.end_date) continue;
      const mine = totalInRange(own, c.start_date, c.end_date, c.exercise_id, c.metric);
      const others = challengeTotals[c.id] ?? {};
      const ahead = Object.entries(others).filter(([, v]) => v > mine).map(([id]) => id);
      standings[c.id] = { groupName: g.name, challengeTitle: c.title, rank: ahead.length + 1, aheadOfMe: ahead };
    }
  }

  return { groups, people, peopleSessions, challengeTotals, push, standings };
}

/** People who moved ahead of you since the previous sync, per challenge. */
export function overtakes(prev: Record<string, Standing>, next: Record<string, Standing>): { standing: Standing; by: string[] }[] {
  const out: { standing: Standing; by: string[] }[] = [];
  for (const [id, s] of Object.entries(next)) {
    const before = prev[id];
    if (!before) continue;
    const by = s.aheadOfMe.filter((p) => !before.aheadOfMe.includes(p));
    if (by.length) out.push({ standing: s, by });
  }
  return out;
}
