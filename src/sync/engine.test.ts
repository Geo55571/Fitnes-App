/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { leaderboard, membersOf, ME_ID } from '../domain/groups';
import type { Challenge, Person, Session, Settings } from '../domain/types';
import type { ArcSharedDay } from '../domain/winterArc';
import {
  EMPTY_PUSH,
  overtakes,
  syncOnce,
  type ChallengeRow,
  type GroupRow,
  type LocalSnapshot,
  type ProfileRow,
  type PushState,
  type Remote,
  type SessionRow,
  type TotalRow,
} from './engine';

/** In-memory server applying the same visibility rules as the SQL policies. */
class FakeServer {
  profiles = new Map<string, ProfileRow>();
  groups = new Map<string, { id: string; name: string; invite_code: string; owner_id: string; created_at: string }>();
  members: { group_id: string; user_id: string }[] = [];
  challenges: ChallengeRow[] = [];
  sessions: SessionRow[] = [];
  totals: TotalRow[] = [];
  calls: string[] = [];
  private n = 0;
  nextId = () => `id${++this.n}`;
  isMember = (g: string, u: string) => this.members.some((m) => m.group_id === g && m.user_id === u);
  sharesGroup = (a: string, b: string) => this.members.some((m) => m.user_id === a && this.isMember(m.group_id, b));
  sharing = (u: string) => this.profiles.get(u)?.sharing ?? 'private';
}

function fakeRemote(srv: FakeServer, me: string): Remote {
  const groupRow = (id: string): GroupRow => {
    const g = srv.groups.get(id)!;
    return { ...g, member_ids: srv.members.filter((m) => m.group_id === id).map((m) => m.user_id), challenges: srv.challenges.filter((c) => c.group_id === id) };
  };
  const log = (s: string) => srv.calls.push(`${me}:${s}`);
  return {
    async upsertProfile(p) {
      srv.profiles.set(me, { ...p, id: me });
    },
    async listMyGroups() {
      return [...srv.groups.keys()].filter((g) => srv.isMember(g, me)).map(groupRow);
    },
    async listProfiles(ids) {
      return ids.filter((id) => srv.sharesGroup(me, id)).map((id) => srv.profiles.get(id)!).filter(Boolean);
    },
    async listTotals(ids) {
      return srv.totals.filter((t) => {
        if (!ids.includes(t.challenge_id)) return false;
        if (t.user_id === me) return true;
        const p = srv.profiles.get(t.user_id);
        const c = srv.challenges.find((x) => x.id === t.challenge_id)!;
        return !!p && p.sharing !== 'private' && p.show_on_leaderboards && srv.isMember(c.group_id, me);
      });
    },
    async listSessions(userIds, since) {
      return srv.sessions.filter((s) => userIds.includes(s.user_id) && s.date >= since && srv.sharesGroup(me, s.user_id) && srv.sharing(s.user_id) === 'everything');
    },
    async upsertSessions(rows) {
      if (srv.sharing(me) !== 'everything') throw new Error('RLS: not sharing everything');
      log(`upsertSessions(${rows.map((r) => r.id).join(',')})`);
      for (const r of rows) {
        srv.sessions = srv.sessions.filter((s) => !(s.user_id === me && s.id === r.id));
        srv.sessions.push({ ...r, user_id: me });
      }
    },
    async deleteSessions(ids) {
      log(`deleteSessions(${ids.join(',')})`);
      srv.sessions = srv.sessions.filter((s) => !(s.user_id === me && ids.includes(s.id)));
    },
    async deleteAllMySessions() {
      log('deleteAllMySessions');
      srv.sessions = srv.sessions.filter((s) => s.user_id !== me);
    },
    async upsertTotals(rows) {
      for (const r of rows) {
        const c = srv.challenges.find((x) => x.id === r.challenge_id)!;
        if (!srv.isMember(c.group_id, me)) throw new Error('RLS: not a member');
        srv.totals = srv.totals.filter((t) => !(t.user_id === me && t.challenge_id === r.challenge_id));
        srv.totals.push({ ...r, user_id: me });
      }
    },
    async deleteMyTotals(ids) {
      srv.totals = srv.totals.filter((t) => !(t.user_id === me && ids.includes(t.challenge_id)));
    },
    async createGroup(name) {
      const id = srv.nextId();
      srv.groups.set(id, { id, name, invite_code: `CODE${srv.groups.size + 1}`.padEnd(6, 'X').slice(0, 6), owner_id: me, created_at: '' });
      srv.members.push({ group_id: id, user_id: me });
      return groupRow(id);
    },
    async joinGroup(code) {
      const g = [...srv.groups.values()].find((x) => x.invite_code === code.toUpperCase());
      if (!g) throw new Error('No group with that invite code');
      if (!srv.isMember(g.id, me)) srv.members.push({ group_id: g.id, user_id: me });
      return groupRow(g.id);
    },
    async leaveGroup(groupId) {
      srv.members = srv.members.filter((m) => !(m.group_id === groupId && m.user_id === me));
    },
    async deleteGroup(groupId) {
      srv.groups.delete(groupId);
    },
    async renameGroup(groupId, name) {
      srv.groups.get(groupId)!.name = name;
    },
    async regenerateInvite() {
      return 'NEWCOD';
    },
    async createChallenge(groupId, c: Omit<Challenge, 'id' | 'createdAt'>) {
      srv.challenges.push({ id: srv.nextId(), group_id: groupId, title: c.title, exercise_id: c.exerciseId, metric: c.metric, start_date: c.startDate, end_date: c.endDate, created_at: '' });
    },
    async deleteChallenge(id) {
      srv.challenges = srv.challenges.filter((c) => c.id !== id);
    },
  };
}

const sess = (id: string, date: string, reps: number, updatedAt = '1'): Session => ({
  id,
  personId: 'me',
  date,
  performedAt: `${date}T10:00:00Z`,
  category: 'bodyweight',
  entries: [{ id: `${id}e`, exerciseId: 'pushups', sets: [{ reps }] }],
  createdAt: '',
  updatedAt,
});

describe('group sync engine', () => {
  const today = '2026-09-30';
  const A = 'user-a';
  const B = 'user-b';

  it('shares between two members exactly as their privacy settings allow', async () => {
    const srv = new FakeServer();
    const ra = fakeRemote(srv, A);
    const rb = fakeRemote(srv, B);
    let a: LocalSnapshot = { name: 'Ana', color: '#1F4B39', sharing: 'everything', showOnLeaderboards: true, today, sessions: [sess('a1', '2026-09-29', 30), { ...sess('demo', '2026-09-29', 999), demo: true }] };
    let b: LocalSnapshot = { name: 'Ben', color: '#3B5B85', sharing: 'challenges', showOnLeaderboards: true, today, sessions: [sess('b1', '2026-09-29', 20)] };
    let pa: PushState = EMPTY_PUSH;
    let pb: PushState = EMPTY_PUSH;

    const g = await ra.createGroup('Morning crew');
    await rb.joinGroup(g.invite_code.toLowerCase());
    await ra.createChallenge(g.id, { title: 'Push-ups', exerciseId: 'pushups', metric: 'reps', startDate: '2026-09-28', endDate: '2026-10-04' });

    let ra1 = await syncOnce(ra, A, a, pa);
    pa = ra1.push;
    const rb1 = await syncOnce(rb, B, b, pb);
    pb = rb1.push;
    ra1 = await syncOnce(ra, A, a, pa);
    pa = ra1.push;

    // A's view: B shares challenge totals only.
    const benForA = ra1.people.find((p) => p.id === B)!;
    assert.equal(benForA.name, 'Ben');
    assert.equal(benForA.sharing, 'challenges');
    const cid = ra1.groups[0].challenges[0].id;
    assert.deepEqual(ra1.challengeTotals[cid], { [B]: 20 });
    assert.equal(ra1.peopleSessions.length, 0);
    assert.deepEqual(ra1.groups[0].memberIds.sort(), [ME_ID, B].sort());
    assert.equal(ra1.groups[0].isOwner, true);

    // B's view: A shares everything; sample data was never uploaded.
    assert.equal(rb1.peopleSessions.length, 1);
    assert.equal(rb1.peopleSessions[0].personId, A);
    assert.equal(rb1.challengeTotals[cid][A], 30);
    assert.equal(srv.sessions.some((s) => s.id === 'demo'), false);

    // Leaderboard on A's device uses synced totals for B.
    const me: Person = { id: ME_ID, name: 'Ana', color: '#000', sharing: 'everything', source: 'self' };
    const rows = leaderboard(
      ra1.groups[0].challenges[0],
      membersOf(ra1.groups[0], ra1.people, me),
      a.sessions.filter((s) => !s.demo),
      [],
      { sharing: 'everything', showOnLeaderboards: true } as Settings,
      ra1.challengeTotals[cid],
    );
    assert.deepEqual(rows.map((r) => [r.person.id, r.value, r.rank]), [[ME_ID, 30, 1], [B, 20, 2]]);

    // Only changes are pushed; deletions are mirrored.
    srv.calls.length = 0;
    a = { ...a, sessions: [sess('a1', '2026-09-29', 35, '2'), sess('a2', '2026-09-30', 10)] };
    pa = (await syncOnce(ra, A, a, pa)).push;
    assert.deepEqual(srv.calls, [`${A}:upsertSessions(a1,a2)`]);
    srv.calls.length = 0;
    a = { ...a, sessions: [sess('a2', '2026-09-30', 10)] };
    pa = (await syncOnce(ra, A, a, pa)).push;
    assert.deepEqual(srv.calls, [`${A}:deleteSessions(a1)`]);

    // B goes private: totals vanish for A.
    b = { ...b, sharing: 'private' };
    pb = (await syncOnce(rb, B, b, pb)).push;
    const ra2 = await syncOnce(ra, A, a, pa);
    assert.equal(ra2.challengeTotals[cid], undefined);
    assert.equal(ra2.people.find((p) => p.id === B)!.sharing, 'private');

    // A stops sharing everything: their sessions are removed from the server.
    a = { ...a, sharing: 'challenges' };
    pa = (await syncOnce(ra, A, a, ra2.push)).push;
    assert.equal(srv.sessions.filter((s) => s.user_id === A).length, 0);
    assert.equal(pa.cleared, true);
  });

  it('reports when someone moves ahead of you', async () => {
    const srv = new FakeServer();
    const ra = fakeRemote(srv, A);
    const rb = fakeRemote(srv, B);
    const a: LocalSnapshot = { name: 'Ana', color: '#1F4B39', sharing: 'everything', showOnLeaderboards: true, today, sessions: [sess('a1', today, 30)] };
    const b: LocalSnapshot = { name: 'Ben', color: '#1F4B39', sharing: 'everything', showOnLeaderboards: true, today, sessions: [sess('b1', today, 10)] };
    const g = await ra.createGroup('Crew');
    await rb.joinGroup(g.invite_code);
    await ra.createChallenge(g.id, { title: 'Push-ups', exerciseId: 'pushups', metric: 'reps', startDate: '2026-09-28', endDate: '2026-10-04' });
    await syncOnce(rb, B, b, EMPTY_PUSH);
    const first = await syncOnce(ra, A, a, EMPTY_PUSH);
    assert.equal(Object.values(first.standings)[0].rank, 1);
    await syncOnce(rb, B, { ...b, sessions: [sess('b1', today, 50)] }, EMPTY_PUSH);
    const second = await syncOnce(ra, A, a, first.push);
    const passed = overtakes(first.standings, second.standings);
    assert.equal(passed.length, 1);
    assert.deepEqual(passed[0].by, [B]);
    assert.equal(passed[0].standing.rank, 2);
  });

  it('never uploads watch readings (calories, heart rate)', async () => {
    const srv = new FakeServer();
    const ride: Session = {
      ...sess('r1', today, 0),
      category: 'cardio',
      source: 'photo',
      entries: [{ id: 'e', exerciseId: 'cycling', distanceM: 7240, durationSec: 2112, stats: { activeKcal: 252, avgHeartRate: 142 } }],
    };
    await syncOnce(fakeRemote(srv, A), A, { name: 'Ana', color: '#1F4B39', sharing: 'everything', showOnLeaderboards: true, today, sessions: [ride] }, EMPTY_PUSH);
    assert.equal(srv.sessions.length, 1);
    assert.deepEqual(srv.sessions[0].entries, [{ id: 'e', exerciseId: 'cycling', distanceM: 7240, durationSec: 2112 }]);
  });
});

describe('Winter Arc sharing in sync', () => {
  const today = '2026-10-07';
  const A = 'user-a';
  const B = 'user-b';

  /** Adds the server's Winter Arc rules (group-mates only, nothing from private profiles) to the fake. */
  function withArc(srv: FakeServer, me: string, store: Map<string, ArcSharedDay[]>): Remote {
    return {
      ...fakeRemote(srv, me),
      async upsertArcDays(rows) {
        const mine = new Map((store.get(me) ?? []).map((d) => [d.date, d]));
        for (const r of rows) mine.set(r.date, r);
        store.set(me, [...mine.values()]);
      },
      async deleteMyArcDays() {
        store.delete(me);
      },
      async listArcDays(userIds, since) {
        return userIds
          .filter((id) => id !== me && srv.sharesGroup(me, id) && srv.sharing(id) !== 'private')
          .flatMap((id) => (store.get(id) ?? []).filter((d) => d.date >= since).map((d) => ({ ...d, user_id: id })));
      },
    };
  }

  it('shows group-mates each day’s completion, and stops when private', async () => {
    const srv = new FakeServer();
    const store = new Map<string, ArcSharedDay[]>();
    const ra = withArc(srv, A, store);
    const rb = withArc(srv, B, store);
    const g = await ra.createGroup('Winter crew');
    await rb.joinGroup(g.invite_code);
    const arcDays: ArcSharedDay[] = [
      { date: '2026-10-06', done: 3, total: 3, complete: true },
      { date: '2026-10-07', done: 2, total: 3, complete: false },
    ];
    const a: LocalSnapshot = { name: 'Ana', color: '#1F4B39', sharing: 'challenges', showOnLeaderboards: true, today, sessions: [], arcDays };
    const b: LocalSnapshot = { name: 'Ben', color: '#3B5B85', sharing: 'everything', showOnLeaderboards: true, today, sessions: [] };

    const pa = (await syncOnce(ra, A, a, EMPTY_PUSH)).push;
    const seen = await syncOnce(rb, B, b, EMPTY_PUSH);
    assert.deepEqual(seen.arcShared[A], arcDays);

    // Unchanged days aren't sent again.
    const before = store.get(A);
    await syncOnce(ra, A, a, pa);
    assert.equal(store.get(A), before);

    // Going private removes them from the server.
    await syncOnce(ra, A, { ...a, sharing: 'private' }, pa);
    assert.equal(store.has(A), false);
    assert.deepEqual((await syncOnce(rb, B, b, EMPTY_PUSH)).arcShared, {});
  });

  it('keeps syncing with a server that has no Winter Arc support', async () => {
    const srv = new FakeServer();
    const r = await syncOnce(fakeRemote(srv, A), A, { name: 'Ana', color: '#1F4B39', sharing: 'everything', showOnLeaderboards: true, today, sessions: [], arcDays: [] }, EMPTY_PUSH);
    assert.deepEqual(r.arcShared, {});
  });
});
