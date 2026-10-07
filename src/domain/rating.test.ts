import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS } from '../store/defaults';
import { ME_ID, selfPerson } from './groups';
import { overallRatings } from './rating';
import type { Group, Person, Session } from './types';

const me = selfPerson('Sam', '#123456', DEFAULT_SETTINGS);
const ana: Person = { id: 'ana', name: 'Ana', color: '#000000', sharing: 'challenges', source: 'remote' };
const bo: Person = { id: 'bo', name: 'Bo', color: '#000000', sharing: 'challenges', source: 'remote' };
const run = (date: string, m: number): Session =>
  ({ id: date, date, performedAt: `${date}T08:00:00Z`, category: 'cardio', entries: [{ id: 'e', exerciseId: 'running', distanceM: m }], createdAt: '', updatedAt: '' }) as unknown as Session;
const group = (id: string, members: string[], challengeId: string): Group => ({
  id,
  name: id,
  createdAt: '',
  inviteCode: 'ABCDEF',
  memberIds: members,
  remote: true,
  challenges: [{ id: challengeId, title: 'Run', exerciseId: 'running', metric: 'distance', startDate: '2026-10-01', endDate: '2026-10-31', createdAt: '' }],
});

describe('overall rating (main challenge)', () => {
  it('rates the leader 100 and others by their share, averaged over challenges', () => {
    const rows = overallRatings(
      [group('g1', [ME_ID, 'ana'], 'c1'), group('g2', [ME_ID, 'ana', 'bo'], 'c2')],
      [ana, bo],
      me,
      [run('2026-10-03', 10000)],
      [],
      DEFAULT_SETTINGS,
      { c1: { ana: 5000 }, c2: { ana: 20000, bo: 10000 } },
      '2026-10-06',
    );
    const by = Object.fromEntries(rows.map((r) => [r.person.name, r]));
    // Sam: 100 in c1, 50 in c2 → 75. Ana: 50 in c1, 100 in c2 → 75. Bo: 50 in c2.
    assert.equal(by.Sam.rating, 75);
    assert.equal(by.Ana.rating, 75);
    assert.equal(by.Bo.rating, 50);
    assert.equal(by.Sam.rank, 1);
    assert.equal(by.Bo.rank, 3);
  });
  it('is empty without challenges', () => {
    assert.deepEqual(overallRatings([], [], me, [], [], DEFAULT_SETTINGS, {}, '2026-10-06'), []);
  });
});
