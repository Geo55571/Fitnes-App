import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeEntry } from './describe';
import type { Session } from './types';
import { planScan, type ScanReading, type ScanWorkout } from './workoutScan';

const TZ = 'Europe/Belgrade';
const TODAY = '2026-10-02';
const NOW = new Date('2026-10-02T16:00:00Z'); // 18:00 in Belgrade
const prefs = { distanceUnit: 'km', weightUnit: 'kg' } as const;

const workout = (w: Partial<ScanWorkout>): ScanWorkout => ({
  activity: 'cycling',
  title: 'Outdoor Cycle',
  duration_seconds: null,
  distance: null,
  active_kcal: null,
  total_kcal: null,
  avg_heart_rate: null,
  max_heart_rate: null,
  elevation_gain: null,
  start_time: null,
  date: null,
  ...w,
});
const reading = (...workouts: ScanWorkout[]): ScanReading => ({ is_workout_summary: true, workouts, note: null });
const ctx = (sessions: Session[] = [], customNames?: Map<string, string>) => ({ today: TODAY, tz: TZ, now: NOW, sessions, customNames });

describe('workout photo scan', () => {
  it('turns an Apple Watch cycling summary into a cycling session with every reading', () => {
    const plan = planScan(
      reading(
        workout({
          duration_seconds: 35 * 60 + 12,
          distance: { value: 7.24, unit: 'km' },
          active_kcal: 251.6,
          total_kcal: 298,
          avg_heart_rate: 142,
          max_heart_rate: 171,
          elevation_gain: { value: 115, unit: 'ft' },
          start_time: '07:12',
        }),
      ),
      ctx(),
    );
    assert.equal(plan.workouts.length, 1);
    const w = plan.workouts[0];
    assert.equal(w.exerciseId, 'cycling');
    assert.equal(w.category, 'cardio');
    assert.equal(w.date, TODAY);
    assert.equal(w.performedAt, '2026-10-02T05:12:00.000Z'); // 07:12 Belgrade (UTC+2)
    assert.deepEqual(w.entry, {
      exerciseId: 'cycling',
      distanceM: 7240,
      durationSec: 2112,
      stats: { activeKcal: 252, totalKcal: 298, avgHeartRate: 142, maxHeartRate: 171, elevationGainM: 35 },
    });
    assert.equal(describeEntry({ ...w.entry, id: 'x' }, prefs), '7.24 km · 35:12 · 12.3 km/h · 252 kcal · avg 142 bpm');
  });

  it('converts miles and keeps indoor rides without a distance', () => {
    const plan = planScan(
      reading(
        workout({ activity: 'running', title: 'Outdoor Run', duration_seconds: 1800, distance: { value: 3.1, unit: 'mi' } }),
        workout({ title: 'Indoor Cycle', duration_seconds: 2700 }),
      ),
      ctx(),
    );
    assert.equal(plan.workouts[0].entry.distanceM, 4989);
    assert.equal(plan.workouts[1].entry.distanceM, undefined);
    assert.equal(plan.workouts[1].entry.durationSec, 2700);
    assert.equal(describeEntry({ ...plan.workouts[1].entry, id: 'x' }, prefs), '45:00');
  });

  it('drops misread values and workouts with nothing usable', () => {
    const plan = planScan(
      reading(
        workout({ duration_seconds: 1500, avg_heart_rate: 900, active_kcal: -5, max_heart_rate: 120, start_time: '25:99' }),
        workout({ activity: 'yoga', title: 'Yoga', duration_seconds: null, active_kcal: 80 }),
      ),
      ctx(),
    );
    assert.equal(plan.workouts.length, 1);
    assert.deepEqual(plan.workouts[0].entry.stats, { maxHeartRate: 120 });
    assert.equal(plan.workouts[0].performedAt, NOW.toISOString());
    assert.deepEqual(plan.skipped, ['Yoga: no time or distance could be read']);
  });

  it('maps unknown workout types to a custom exercise, reusing one with the same name', () => {
    const fresh = planScan(reading(workout({ activity: 'other', title: 'Indoor pilates', duration_seconds: 3000 })), ctx());
    assert.equal(fresh.workouts[0].exerciseId, null);
    assert.equal(fresh.workouts[0].customName, 'Pilates');
    assert.equal(fresh.workouts[0].customKind, 'duration');

    const reused = planScan(reading(workout({ activity: 'other', title: 'Pilates', duration_seconds: 3000 })), ctx([], new Map([['pilates', 'x-pil']])));
    assert.equal(reused.workouts[0].exerciseId, 'x-pil');
  });

  it('uses the date on the photo only when it is believable', () => {
    const at = (date: string | null) => planScan(reading(workout({ duration_seconds: 600, date })), ctx()).workouts[0].date;
    assert.equal(at('2026-09-30'), '2026-09-30');
    assert.equal(at('2026-10-05'), TODAY); // future
    assert.equal(at('2025-10-01'), TODAY); // a year ago: likely the wrong year
    assert.equal(at('Wed'), TODAY);
  });

  it('flags a workout that is already logged', () => {
    const existing: Session = {
      id: 's1',
      personId: 'me',
      date: TODAY,
      performedAt: NOW.toISOString(),
      category: 'cardio',
      entries: [{ id: 'e', exerciseId: 'cycling', distanceM: 7210, durationSec: 2100 }],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    const same = planScan(reading(workout({ duration_seconds: 2112, distance: { value: 7.24, unit: 'km' } })), ctx([existing]));
    assert.equal(same.workouts[0].duplicateOf, 's1');
    const longer = planScan(reading(workout({ duration_seconds: 3600, distance: { value: 15, unit: 'km' } })), ctx([existing]));
    assert.equal(longer.workouts[0].duplicateOf, undefined);
  });

  it('survives a malformed reading', () => {
    assert.deepEqual(planScan({ is_workout_summary: false, workouts: [], note: 'Not a workout' }, ctx()), { workouts: [], skipped: [] });
    assert.deepEqual(planScan({} as ScanReading, ctx()), { workouts: [], skipped: [] });
  });
});
