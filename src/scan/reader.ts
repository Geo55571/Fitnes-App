import { Platform } from 'react-native';

import type { DayKey } from '@/domain/types';
import type { ScanReading } from '@/domain/workoutScan';

import type { ScanImage } from './photo';

/**
 * Where workout photos are read. On the website it's this site's own /api/analyze
 * (functions/api/analyze.ts); the phone app needs the full URL in EXPO_PUBLIC_ANALYZE_URL.
 * The endpoint contract is: POST { image, media_type, today } → ScanReading JSON.
 */
const ANALYZE_URL = process.env.EXPO_PUBLIC_ANALYZE_URL || (Platform.OS === 'web' ? '/api/analyze' : '');

/** The reading service isn't set up (no endpoint, or no AI key on the server). */
export class ReaderUnavailableError extends Error {}

export async function readWorkoutPhoto(image: ScanImage, today: DayKey): Promise<ScanReading> {
  if (!ANALYZE_URL) throw new ReaderUnavailableError('Photo reading isn’t set up in this app yet.');
  let res: Response;
  try {
    res = await fetch(ANALYZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: image.base64, media_type: 'image/jpeg', today }),
    });
  } catch {
    throw new Error('Can’t reach the photo reader. Check your connection and try again.');
  }
  // 404: no endpoint deployed (e.g. local dev server); 501: deployed but no AI key yet.
  if (res.status === 404 || res.status === 501) throw new ReaderUnavailableError('Photo reading isn’t switched on yet.');
  if (res.status === 413) throw new Error('That photo is too large. Try again a little further away.');
  if (res.status === 429) throw new Error('Too many photos at once. Wait a minute and try again.');
  if (res.status === 422) throw new Error('The photo couldn’t be read. Try a sharper, closer photo of the summary.');
  if (!res.ok) throw new Error('The photo reader had a problem. Try again in a moment.');

  const data = (await res.json().catch(() => null)) as ScanReading | null;
  if (!data || typeof data.is_workout_summary !== 'boolean' || !Array.isArray(data.workouts)) {
    throw new Error('The photo reader sent back something unexpected. Try again.');
  }
  return data;
}
