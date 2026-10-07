import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeStreak, streakStage } from './streak';
import type { Session } from './types';

const s = (date: string, extra: Partial<Session> = {}) => ({ id: date, date, performedAt: `${date}T10:00:00Z`, category: 'cardio', entries: [], createdAt: '', updatedAt: '', ...extra }) as Session;

describe('workout streak', () => {
  it('counts days in a row up to today', () => {
    const r = computeStreak([s('2026-10-04'), s('2026-10-05'), s('2026-10-06')], '2026-10-06');
    assert.deepEqual(r, { current: 3, best: 3, doneToday: true, missed: 0, activeDays: 3 });
  });
  it('keeps a streak through yesterday alive until today ends', () => {
    const r = computeStreak([s('2026-10-04'), s('2026-10-05')], '2026-10-06');
    assert.equal(r.current, 2);
    assert.equal(r.doneToday, false);
  });
  it('breaks after a missed day, and counts missed days and the best run', () => {
    const r = computeStreak([s('2026-09-28'), s('2026-09-29'), s('2026-09-30'), s('2026-10-03')], '2026-10-06');
    assert.equal(r.current, 0);
    assert.equal(r.best, 3);
    assert.equal(r.missed, 4); // Oct 1, 2, 4, 5 — today isn't over yet
  });
  it('ignores sample and other people’s workouts', () => {
    assert.equal(computeStreak([s('2026-10-06', { demo: true }), s('2026-10-06', { remote: true })], '2026-10-06').current, 0);
  });
  it('evolves the flame', () => {
    assert.equal(streakStage(0).stage.name, 'Ember');
    assert.equal(streakStage(7).stage.name, 'Blaze');
    assert.equal(streakStage(7).next?.from, 14);
    assert.equal(streakStage(150).next, null);
  });
});
