import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fixDigits, interpretWorkoutText, isCertain, joinSplitTimes, withActivity, type OcrLineInput } from './workoutInterpreter';
import { planScan } from './workoutScan';

const TODAY = '2026-10-02';
/** Lines without positions (like a plain text paste). */
const text = (s: string): OcrLineInput[] => s.split('\n').map((t) => ({ text: t, confidence: 0.9, box: null }));
/** Lines laid out on a screen: [text, x, y, width] with a fixed line height. */
const screen = (rows: [string, number, number, number][]): OcrLineInput[] =>
  rows.map(([t, x, y, width]) => ({ text: t, confidence: 0.92, box: { x, y, width, height: 0.03 } }));

const read = (lines: OcrLineInput[]) => interpretWorkoutText(lines, { today: TODAY });

describe('workout interpreter', () => {
  it('reads an Apple Watch summary (real OCR output of the test photo)', () => {
    const r = read(
      screen([
        ['Outdoor Cycle', 0.07, 0.07, 0.25],
        ['Workout Time', 0.07, 0.11, 0.22],
        ['0:35:12', 0.07, 0.15, 0.2],
        ['Distance', 0.07, 0.2, 0.15],
        ['7.24KM', 0.07, 0.24, 0.17],
        ['Active Kilocalories', 0.07, 0.29, 0.3],
        ['252CAL', 0.07, 0.33, 0.17],
        ['Avg. Heart Rate', 0.07, 0.38, 0.25],
        ['142BPM', 0.07, 0.42, 0.17],
      ]),
    );
    const w = r.reading.workouts[0];
    assert.equal(r.reading.is_workout_summary, true);
    assert.equal(w.activity, 'cycling');
    assert.equal(w.title, 'Outdoor Cycle');
    assert.equal(w.duration_seconds, 2112);
    assert.deepEqual(w.distance, { value: 7.24, unit: 'km' });
    assert.equal(w.active_kcal, 252);
    assert.equal(w.avg_heart_rate, 142);
    assert.deepEqual(r.found, { activity: 'text', duration: 'label', distance: 'label', active_kcal: 'label', avg_hr: 'label' });
    assert.ok(r.score > 0.8, `score ${r.score}`);
  });

  it('reads an iPhone Fitness screenshot with labels side by side', () => {
    const r = read(
      screen([
        ['9:41', 0.08, 0.01, 0.1], // status bar
        ['Wed, Sep 30', 0.06, 0.08, 0.3],
        ['Outdoor Run', 0.2, 0.13, 0.3],
        ['7:02-7:48 AM', 0.2, 0.17, 0.3],
        ['Workout Time            Distance', 0.06, 0.3, 0.8],
        ['0:46:13                 8.02KM', 0.06, 0.34, 0.8],
        ['Active Kilocalories     Total Kilocalories', 0.06, 0.41, 0.85],
        ['512CAL                  598CAL', 0.06, 0.45, 0.8],
        ['Elevation Gain          Avg. Power', 0.06, 0.52, 0.8],
        ['41M                     238W', 0.06, 0.56, 0.8],
        ['Avg. Cadence            Avg. Pace', 0.06, 0.63, 0.8],
        ['168SPM                  5\'46"/KM', 0.06, 0.67, 0.8],
        ['Avg. Heart Rate', 0.06, 0.74, 0.4],
        ['151BPM', 0.06, 0.78, 0.2],
      ]),
    );
    const w = r.reading.workouts[0];
    assert.equal(w.activity, 'running');
    assert.equal(w.date, '2026-09-30');
    assert.equal(w.start_time, '07:02');
    assert.equal(w.duration_seconds, 46 * 60 + 13);
    assert.deepEqual(w.distance, { value: 8.02, unit: 'km' });
    assert.equal(w.active_kcal, 512);
    assert.equal(w.total_kcal, 598);
    assert.deepEqual(w.elevation_gain, { value: 41, unit: 'm' });
    assert.equal(w.avg_heart_rate, 151);
  });

  it('reads a Garmin-style screen with labels and values on one line', () => {
    const w = read(text('Indoor Rowing\nTime 22:40\nDistance 4,850 m\nCalories 310\nAvg HR 138 bpm\nMax HR 171 bpm')).reading.workouts[0];
    assert.equal(w.activity, 'rowing');
    assert.equal(w.duration_seconds, 22 * 60 + 40);
    assert.deepEqual(w.distance, { value: 4850, unit: 'm' });
    assert.equal(w.total_kcal, 310);
    assert.equal(w.avg_heart_rate, 138);
    assert.equal(w.max_heart_rate, 171);
  });

  it('understands German labels and unit-less heart rate', () => {
    const w = read(text('Funktionales Krafttraining\nTrainingsdauer 0:52:08\nAktive Kalorien 287 kcal\nGesamtkalorien 351 kcal\nØ Herzfrequenz 118 S/min')).reading
      .workouts[0];
    assert.equal(w.activity, 'strength_training');
    assert.equal(w.duration_seconds, 52 * 60 + 8);
    assert.equal(w.active_kcal, 287);
    assert.equal(w.total_kcal, 351);
    assert.equal(w.avg_heart_rate, 118);
  });

  it('keeps unknown workout names for a custom exercise', () => {
    const w = read(text('Pilates\nWorkout Time\n45:00\nActive Kilocalories\n180CAL')).reading.workouts[0];
    assert.equal(w.activity, 'other');
    assert.equal(w.title, 'Pilates');
    assert.equal(w.duration_seconds, 2700);
  });

  it('hands unknown workout names to the AI and applies its answer', () => {
    const r = read(text('ZUMBA\nToday 18:05\nTotal time 48:10\nCalories burned 214 kcal\nAverage pulse 112 bpm'));
    assert.equal(r.reading.is_workout_summary, true);
    assert.equal(r.unknownName, 'ZUMBA');
    const w = r.reading.workouts[0];
    assert.equal(w.activity, 'other');
    assert.equal(w.title, 'Zumba');
    assert.equal(w.duration_seconds, 48 * 60 + 10);
    assert.equal(w.avg_heart_rate, 112);

    const leg = read(text('Leg day\nDuration 00:52:40\n410 kcal'));
    assert.equal(leg.unknownName, 'Leg day');
    const classified = withActivity(leg, 'strength_training');
    assert.equal(classified.reading.workouts[0].activity, 'strength_training');
    assert.equal(classified.found.activity, 'ai');
    assert.equal(classified.unknownName, null);
    // Known names never go to the AI.
    assert.equal(read(text('Morning jog\nDistance 5.1 km\nWorkout Time 28:40')).unknownName, null);
  });

  it('reads a photo of the live Apple Watch swim view (real OCR output)', () => {
    // What the browser OCR read from a user's photo: the type is only an icon, labels are tiny.
    const box = (x0: number, y0: number, x1: number, y1: number) => ({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    const r = read([
      { text: '$10:09', confidence: 0.7, box: box(0.58, 0.19, 0.77, 0.24) },
      { text: '19:39.05', confidence: 0.92, box: box(0.11, 0.32, 0.59, 0.39) },
      { text: '152"', confidence: 0.96, box: box(0.08, 0.42, 0.3, 0.49) },
      { text: 'TOTAL', confidence: 0.95, box: box(0.31, 0.505, 0.46, 0.53) },
      { text: '182', confidence: 0.96, box: box(0.08, 0.51, 0.3, 0.58) },
      { text: '37LAPS', confidence: 0.91, box: box(0.08, 0.61, 0.49, 0.67) },
      { text: '925M', confidence: 0.85, box: box(0.08, 0.7, 0.4, 0.77) },
    ]);
    const w = r.reading.workouts[0];
    assert.equal(r.reading.is_workout_summary, true);
    assert.equal(w.activity, 'swimming');
    assert.equal(r.found.activity, 'infer');
    assert.equal(w.duration_seconds, 19 * 60 + 39);
    assert.equal(r.found.duration, 'stopwatch');
    assert.deepEqual(w.distance, { value: 925, unit: 'm' });
    assert.equal(w.total_kcal, 182);
    assert.equal(w.active_kcal, 152);
    // The type was only inferred, so the user checks it before it's saved.
    assert.equal(isCertain(r), false);
  });

  it('rejoins a time cut in two on a tilted photo (real OCR output)', () => {
    const box = (x0: number, y0: number, x1: number, y1: number) => ({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    const r = read([
      { text: '$10:09', confidence: 0.21, box: box(0.58, 0.18, 0.77, 0.24) },
      { text: '19:3', confidence: 0.96, box: box(0.12, 0.31, 0.42, 0.39) },
      { text: '9.05', confidence: 0.96, box: box(0.43, 0.33, 0.61, 0.4) },
      { text: '152', confidence: 0.96, box: box(0.08, 0.42, 0.3, 0.49) },
      { text: '37LAps', confidence: 0.78, box: box(0.08, 0.61, 0.49, 0.67) },
    ]);
    assert.equal(r.reading.workouts[0].duration_seconds, 19 * 60 + 39);
    assert.deepEqual(joinSplitTimes([{ text: '19:3', confidence: 0.9, box: null }, { text: '9.05', confidence: 0.8, box: null }]), [
      { text: '19:39.05', confidence: 0.8, box: null },
    ]);
    // Glare: the small "KCAL" under 182 was read as "m". The clearer meters value is the distance.
    const glare = read([
      { text: '19:39.05', confidence: 0.91, box: box(0.11, 0.32, 0.59, 0.39) },
      { text: '182m', confidence: 0.31, box: box(0.08, 0.51, 0.3, 0.58) },
      { text: '37LAPS', confidence: 0.87, box: box(0.08, 0.61, 0.49, 0.67) },
      { text: '925M', confidence: 0.95, box: box(0.08, 0.7, 0.4, 0.77) },
    ]);
    assert.deepEqual(glare.reading.workouts[0].distance, { value: 925, unit: 'm' });
    // Pieces that are already whole, or far apart, stay separate.
    assert.equal(joinSplitTimes(text('10:09\n9.05')).length, 2);
    assert.equal(
      joinSplitTimes([
        { text: '19:3', confidence: 0.9, box: box(0.1, 0.3, 0.3, 0.36) },
        { text: '9', confidence: 0.9, box: box(0.1, 0.6, 0.2, 0.66) },
      ]).length,
      2,
    );
  });

  describe('Apple Watch live workout views (real OCR output of Apple screenshots and user photos)', () => {
    const box = (x0: number, y0: number, x1: number, y1: number) => ({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    const pacer = (distance: string): OcrLineInput[] => [
      { text: '10:09', confidence: 0.95, box: box(0.6, 0.26, 0.69, 0.29) },
      { text: '27:04.32', confidence: 0.91, box: box(0.3, 0.37, 0.58, 0.43) },
      { text: `8'37" AVERAGE PACE`, confidence: 0.89, box: box(0.31, 0.51, 0.6, 0.57) },
      { text: `8'56" CURRENT PACE`, confidence: 0.33, box: box(0.32, 0.58, 0.6, 0.64) },
      { text: distance, confidence: 0.4, box: box(0.32, 0.65, 0.52, 0.71) },
    ];

    it('takes the stopwatch time, not the clock, and the type from the icon', () => {
      const r = interpretWorkoutText(pacer('3.14MI'), { today: TODAY, icon: { activity: 'running', score: 0.83 } });
      const w = r.reading.workouts[0];
      assert.equal(w.activity, 'running');
      assert.equal(r.found.activity, 'icon');
      assert.equal(w.duration_seconds, 27 * 60 + 4);
      assert.deepEqual(w.distance, { value: 3.14, unit: 'mi' });
      assert.equal(isCertain(r), true);
    });

    it('knows a run by its pace when there is no icon, and works out a distance it could not read', () => {
      const r = read(pacer('3 14m]'));
      const w = r.reading.workouts[0];
      assert.equal(w.activity, 'running');
      assert.equal(r.found.activity, 'infer');
      // 27:04 at 8'37" per mile (the user's unit) = 3.14 mi.
      const mi = interpretWorkoutText(pacer('3 14m]'), { today: TODAY, distanceUnit: 'mi' }).reading.workouts[0];
      assert.deepEqual(mi.distance, { value: 3.14, unit: 'mi' });
      assert.equal(isCertain(r), false); // guessed: the user checks it
      // A walking pace is a walk; a slow jog still a run.
      const walk = (pace: string, unit: 'km' | 'mi') => interpretWorkoutText(text(`41:20.11\n${pace} AVERAGE PACE`), { today: TODAY, distanceUnit: unit }).reading.workouts[0].activity;
      assert.equal(walk(`11'05"`, 'km'), 'walking');
      assert.equal(walk(`17'40"`, 'mi'), 'walking');
      assert.equal(walk(`8'37"`, 'km'), 'running');
    });

    it('skips the clock even when the workout time is a plain time', () => {
      const r = read([
        { text: '10:09', confidence: 0.95, box: box(0.6, 0.1, 0.7, 0.14) },
        { text: '31:47 AVERAGE PACE', confidence: 0.9, box: box(0.1, 0.3, 0.6, 0.38) },
        { text: '42:15', confidence: 0.9, box: box(0.1, 0.4, 0.5, 0.48) },
        { text: '5.02KM', confidence: 0.9, box: box(0.1, 0.5, 0.5, 0.58) },
      ]);
      assert.equal(r.reading.workouts[0].duration_seconds, 42 * 60 + 15);
    });

    it('ignores "time in zone" and fixes OCR slips in heart rate and units', () => {
      const r = interpretWorkoutText(
        [
          { text: '10:09', confidence: 0.95, box: box(0.6, 0.12, 0.7, 0.16) },
          { text: '31:47.01', confidence: 0.88, box: box(0.12, 0.27, 0.55, 0.35) },
          { text: '148e', confidence: 0.31, box: box(0.13, 0.48, 0.4, 0.56) },
          { text: '23:53; TIME IN ZONE', confidence: 0.8, box: box(0.13, 0.58, 0.58, 0.66) },
          { text: '1378BPM:! AVERAGE HR', confidence: 0.39, box: box(0.13, 0.69, 0.72, 0.77) },
        ],
        { today: TODAY, icon: { activity: 'running', score: 0.83 } },
      );
      const w = r.reading.workouts[0];
      assert.equal(w.duration_seconds, 31 * 60 + 47);
      assert.equal(w.avg_heart_rate, 137);
      assert.equal(isCertain(r), true);
    });

    it('reads the cycling view: speed, climb, and a stopwatch read with a colon for its point', () => {
      const r = read([
        { text: '10:09', confidence: 0.96, box: box(0.6, 0.12, 0.7, 0.16) },
        { text: '31:12:25', confidence: 0.4, box: box(0.1, 0.24, 0.55, 0.31) },
        { text: '137%', confidence: 0.56, box: box(0.1, 0.33, 0.3, 0.4) },
        { text: '16.2 AVERAGE MPH', confidence: 0.63, box: box(0.1, 0.42, 0.6, 0.49) },
        { text: '372FT: ELEV GAINED', confidence: 0.86, box: box(0.1, 0.51, 0.62, 0.58) },
        { text: '8.4M|', confidence: 0.28, box: box(0.1, 0.6, 0.4, 0.67) },
      ]);
      const w = r.reading.workouts[0];
      assert.equal(w.activity, 'cycling'); // from "MPH"
      assert.equal(w.duration_seconds, 31 * 60 + 12);
      assert.deepEqual(w.distance, { value: 8.4, unit: 'mi' });
      assert.deepEqual(w.elevation_gain, { value: 372, unit: 'ft' });
    });

    it('works out a ride’s distance from its average speed when the distance was not read', () => {
      const w = read(text('31:12.25\n16.2 AVERAGE MPH')).reading.workouts[0];
      assert.deepEqual(w.distance, { value: 8.42, unit: 'mi' });
    });
  });

  it('is certain only when the name and the time were read clearly', () => {
    assert.equal(isCertain(read(text('Outdoor Cycle\nWorkout Time\n0:35:12\nDistance\n7.24KM'))), true);
    assert.equal(isCertain(read(text('Outdoor Cycle\n7.24 km'))), false); // no time
    assert.equal(isCertain(read(text('12:43\n7.24 km'))), false); // no name, clock-like time
  });

  it('places unlabelled values by their unit', () => {
    const w = read(text('Evening Ride\n1:12:05\n31.4 km\n640 kcal\n128 bpm')).reading.workouts[0];
    assert.equal(w.activity, 'cycling');
    assert.equal(w.duration_seconds, 4325);
    assert.deepEqual(w.distance, { value: 31.4, unit: 'km' });
    assert.equal(w.active_kcal, 640);
    assert.equal(w.avg_heart_rate, 128);
  });

  it('fixes common OCR digit mix-ups only inside numbers', () => {
    assert.equal(fixDigits('Distance 1O.5KM'), 'Distance 10.5KM');
    assert.equal(fixDigits('Avg l42 bpm'), 'Avg 142 bpm');
    assert.equal(fixDigits('Outdoor Cycle'), 'Outdoor Cycle');
    const w = read(text('Outdoor Walk\nWorkout Time\n0:3O:00\nDistance\n2.4KM')).reading.workouts[0];
    assert.equal(w.duration_seconds, 1800);
  });

  it('says so when the photo is not a workout', () => {
    const r = read(text('Price: €19.99\nWeight: 72.4 kg\nBattery: 93%'));
    assert.equal(r.reading.is_workout_summary, false);
    assert.deepEqual(r.reading.workouts, []);
    assert.equal(r.score, 0);
    // A speed in some document doesn't make it a bike ride.
    assert.equal(read(text('Speed: 25 km/h\nTime: 12:43')).found.activity, undefined);
  });

  it('feeds straight into the scan planner', () => {
    const r = read(text('Outdoor Cycle\nWorkout Time\n0:35:12\nDistance\n7.24KM\nActive Kilocalories\n252CAL\nAvg. Heart Rate\n142BPM'));
    const plan = planScan(r.reading, { today: TODAY, tz: 'Europe/Belgrade', now: new Date('2026-10-02T16:00:00Z'), sessions: [] });
    assert.equal(plan.workouts.length, 1);
    assert.deepEqual(plan.workouts[0].entry, { exerciseId: 'cycling', distanceM: 7240, durationSec: 2112, stats: { activeKcal: 252, avgHeartRate: 142 } });
  });
});
