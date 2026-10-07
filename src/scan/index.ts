/**
 * Scan a workout photo → read it → save it. The camera button starts a scan and the
 * /scan screen shows its progress; state lives here so both can see it.
 *
 * Photos are read on this device (src/scan/local.ts). A clear reading (workout name and time
 * read from their labels) is saved straight away, with Undo. Anything less certain — a photo of
 * the live workout view, a blurry shot, missing values — goes to a short "Check and save" form
 * with everything that was read already filled in, so a photo never ends in a dead end.
 */
import { create } from 'zustand';

import { useLocalAi } from '@/ai';
import { dayKeyFor, resolveTimeZone } from '@/domain/dates';
import type { Session } from '@/domain/types';
import { isCertain } from '@/domain/workoutInterpreter';
import { planScan, type PlannedWorkout, type ScanReading, type ScanWorkout } from '@/domain/workoutScan';
import { useStore } from '@/store/store';

import { canReadOnDevice, readOnDevice, type LocalStage } from './local';
import { pickWorkoutPhoto, type ScanImage } from './photo';
import { readWorkoutPhoto, ReaderUnavailableError } from './reader';

export { pickWorkoutPhoto } from './photo';

export type ScanStatus = 'idle' | 'reading' | 'review' | 'saved' | 'nothing' | 'unavailable' | 'error';
export type ScanStage = LocalStage | 'cloud';

/** What the "Check and save" form starts from. */
export interface ScanDraft {
  workout: ScanWorkout;
  /** Which values came from the photo (the rest are empty for the user to fill in). */
  fromPhoto: Partial<Record<'activity' | 'duration' | 'distance' | 'active_kcal' | 'total_kcal' | 'avg_hr', boolean>>;
  /** Values not printed on the screen but worked out: the type from clues, the distance from pace × time. */
  guessed?: Partial<Record<'activity' | 'distance', boolean>>;
  /** The text read from the photo, for reference. */
  lines: string[];
}

interface ScanState {
  status: ScanStatus;
  /** What's happening while reading. */
  stage: ScanStage | null;
  image: ScanImage | null;
  /** Sessions created by this scan (for Edit / Undo). */
  saved: Session[];
  /** Workouts found but already logged. */
  duplicates: PlannedWorkout[];
  /** Why parts of the photo couldn't be used. */
  notes: string[];
  message: string | null;
  draft: ScanDraft | null;
  /** How the photo was read: on this device (with or without the AI), or by the cloud reader. */
  via: 'device' | 'device-ai' | 'cloud' | null;
  /** The workout's name wasn't recognized and the on-device AI (not downloaded) could have helped. */
  aiCouldHelp: boolean;
  /** Increments per scan so a late answer from an old scan is ignored. */
  run: number;
}

const fresh = () => ({ stage: null, saved: [], duplicates: [], notes: [], message: null, draft: null, via: null, aiCouldHelp: false });

export const useScan = create<ScanState>(() => ({ status: 'idle', image: null, run: 0, ...fresh() }));

export function resetScan() {
  useScan.setState((s) => ({ status: 'idle', image: null, run: s.run + 1, ...fresh() }));
}

const emptyWorkout = (): ScanWorkout => ({
  activity: 'other',
  title: '',
  duration_seconds: null,
  distance: null,
  active_kcal: null,
  total_kcal: null,
  avg_heart_rate: null,
  max_heart_rate: null,
  elevation_gain: null,
  start_time: null,
  date: null,
});

/** Opens the form with nothing filled in (e.g. when the photo had no readable text). */
export function enterManually() {
  const lines = useScan.getState().draft?.lines ?? [];
  useScan.setState({ status: 'review', draft: { workout: emptyWorkout(), fromPhoto: {}, lines }, message: null });
}

/**
 * Reads the photo and saves what it finds. On this device first (OCR + interpreter + local AI);
 * the cloud reader is only used when the user switched it on in Settings.
 */
export async function startScan(image: ScanImage): Promise<void> {
  const run = useScan.getState().run + 1;
  useScan.setState({ status: 'reading', image, run, ...fresh() });
  const current = () => useScan.getState().run === run;

  const app = useStore.getState();
  const tz = resolveTimeZone(app.settings.timeZone);
  const today = dayKeyFor(new Date(), tz);

  try {
    let local: Awaited<ReturnType<typeof readOnDevice>> | null = null;
    let localError: unknown = null;
    if (canReadOnDevice()) {
      try {
        local = await readOnDevice(image.uri, { today, distanceUnit: app.settings.distanceUnit }, (stage) => current() && useScan.setState({ stage }));
      } catch (e) {
        localError = e;
      }
      if (!current()) return;
    }
    const interp = local?.interpretation;
    const aiCouldHelp = !!interp?.unknownName && !local?.usedAi && useLocalAi.getState().status === 'absent';
    const via = local?.usedAi ? 'device-ai' : 'device';

    // 1. A clear reading: save it.
    if (interp && interp.reading.is_workout_summary && isCertain(interp)) {
      finish(interp.reading, via, aiCouldHelp);
      return;
    }

    // 2. The cloud reader, if switched on and this device found no workout.
    if (app.settings.cloudPhotoReading && !interp?.reading.is_workout_summary) {
      useScan.setState({ stage: 'cloud' });
      try {
        const reading = await readWorkoutPhoto(image, today);
        if (!current()) return;
        if (reading.is_workout_summary) {
          finish(reading, 'cloud', false);
          return;
        }
      } catch (e) {
        if (!interp) throw e;
      }
    }

    if (!local || !interp) {
      if (localError) throw localError;
      throw new ReaderUnavailableError('Reading photos on this device needs the full FORM app (not Expo Go).');
    }

    // 3. Something was read: let the user check and complete it.
    const lines = local.lines;
    if (interp.reading.is_workout_summary || lines.some((l) => /\d/.test(l))) {
      const f = interp.found;
      useScan.setState({
        status: 'review',
        stage: null,
        via,
        aiCouldHelp,
        draft: {
          workout: interp.reading.workouts[0] ?? emptyWorkout(),
          fromPhoto: {
            activity: !!f.activity,
            duration: !!f.duration,
            distance: !!f.distance,
            active_kcal: !!f.active_kcal,
            total_kcal: !!f.total_kcal,
            avg_hr: !!f.avg_hr,
          },
          guessed: { activity: f.activity === 'infer', distance: f.distance === 'infer' },
          lines,
        },
      });
      return;
    }

    // 4. Nothing readable at all.
    useScan.setState({
      status: 'nothing',
      stage: null,
      via,
      draft: { workout: emptyWorkout(), fromPhoto: {}, lines },
      message: lines.length ? 'No workout numbers found in this photo' : 'No text could be read from this photo',
    });
  } catch (e) {
    if (!current()) return;
    useScan.setState({
      status: e instanceof ReaderUnavailableError ? 'unavailable' : 'error',
      stage: null,
      message: e instanceof Error ? e.message : 'Something went wrong.',
    });
  }
}

function finish(reading: ScanReading, via: ScanState['via'], aiCouldHelp: boolean) {
  const { saved, duplicates, skipped } = logReading(reading);
  useScan.setState({
    status: saved.length || duplicates.length ? 'saved' : 'nothing',
    stage: null,
    saved,
    duplicates,
    notes: skipped,
    via,
    aiCouldHelp,
    message: saved.length || duplicates.length ? null : 'The workout couldn’t be saved.',
  });
}

/** Saves the workout from the "Check and save" form. Returns false if there was nothing to save. */
export function saveDraft(workout: ScanWorkout): boolean {
  const { saved, duplicates, skipped } = logReading({ is_workout_summary: true, workouts: [workout], note: null });
  if (!saved.length && !duplicates.length) {
    useScan.setState({ notes: skipped });
    return false;
  }
  useScan.setState({ status: 'saved', saved, duplicates, notes: skipped });
  return true;
}

/** Checks a reading (units, plausibility, duplicates) and saves its workouts. */
export function logReading(reading: ScanReading): { saved: Session[]; duplicates: PlannedWorkout[]; skipped: string[] } {
  const app = useStore.getState();
  const tz = resolveTimeZone(app.settings.timeZone);
  const plan = planScan(reading, {
    today: dayKeyFor(new Date(), tz),
    tz,
    now: new Date(),
    sessions: app.sessions,
    customNames: new Map(app.customExercises.map((e) => [e.name.toLowerCase(), e.id])),
  });
  const toSave = plan.workouts.filter((w) => !w.duplicateOf);
  return {
    saved: toSave.length ? app.addScannedWorkouts(toSave) : [],
    duplicates: plan.workouts.filter((w) => w.duplicateOf),
    skipped: plan.skipped,
  };
}

/** Removes everything this scan added. */
export function undoScan() {
  const { saved } = useScan.getState();
  const del = useStore.getState().deleteSession;
  for (const s of saved) del(s.id);
  useScan.setState({ saved: [], duplicates: [], status: 'nothing', message: 'Removed. Nothing from this photo is saved.' });
}

/** Camera/library → scan. Call straight from a tap (see pickWorkoutPhoto). Resolves true if a photo was taken. */
export function scanFrom(source: 'camera' | 'library'): Promise<boolean> {
  return pickWorkoutPhoto(source).then((image) => {
    if (!image) return false;
    void startScan(image);
    return true;
  });
}
