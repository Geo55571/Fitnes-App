import type { DistanceUnit, Metric, WeightUnit } from './types';

export const METERS_PER_MILE = 1609.344;
export const KG_PER_LB = 0.45359237;

/** Values closer than this (in canonical units) count as equal. Avoids float drift after unit conversion. */
const EPSILON = 0.001;

export function isComplete(value: number, target: number): boolean {
  return target > 0 && value + EPSILON >= target;
}

export interface UnitPrefs {
  distanceUnit: DistanceUnit;
  weightUnit: WeightUnit;
}

// ---------- parsing (display units → canonical) ----------

/** Accepts "3.2", "3,2", " 3 ". Returns NaN for anything else. */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN;
  return Number(t);
}

export function parseInteger(text: string): number {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return NaN;
  return Number(t);
}

export function distanceToMeters(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value * 1000 : value * METERS_PER_MILE;
}

export function metersToDistance(m: number, unit: DistanceUnit): number {
  return unit === 'km' ? m / 1000 : m / METERS_PER_MILE;
}

export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function kgToWeight(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

// ---------- formatting ----------

/** Rounds to at most `decimals`, trimming trailing zeros. `floor` never overstates. */
export function trimNumber(n: number, decimals: number, mode: 'round' | 'floor' = 'round'): string {
  const f = 10 ** decimals;
  const scaled = mode === 'floor' ? Math.floor(n * f + 1e-9) : Math.round(n * f);
  const out = (scaled / f).toFixed(decimals);
  // Only trim zeros after a decimal point — never from whole numbers like "1440".
  return decimals > 0 ? out.replace(/\.?0+$/, '') : out;
}

export function withThousands(s: string): string {
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `${grouped}.${dec}` : grouped;
}

/** "1:40", "12:05", "1:02:03" */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** "32 min", "1 h 5 min", "45 s" — for prose. */
export function formatDurationWords(totalSec: number): string {
  const s = Math.round(totalSec);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export interface Formatted {
  value: string;
  unit: string;
}

export function metricUnit(metric: Metric, prefs: UnitPrefs, count = 2): string {
  switch (metric) {
    case 'reps':
      return count === 1 ? 'rep' : 'reps';
    case 'sets':
      return count === 1 ? 'set' : 'sets';
    case 'volume':
      return prefs.weightUnit;
    case 'distance':
      return prefs.distanceUnit;
    case 'duration':
      return '';
  }
}

/**
 * Canonical value → display string.
 * `mode: 'floor'` is used for progress toward a target so a partial value is never
 * rounded up to look complete (e.g. 4.996 km of 5 km must not read "5 / 5").
 */
export function formatMetric(
  value: number,
  metric: Metric,
  prefs: UnitPrefs,
  mode: 'round' | 'floor' = 'round',
): Formatted {
  switch (metric) {
    case 'reps':
    case 'sets': {
      const n = mode === 'floor' ? Math.floor(value) : Math.round(value);
      return { value: withThousands(String(n)), unit: metricUnit(metric, prefs, n) };
    }
    case 'volume':
      return {
        value: withThousands(trimNumber(kgToWeight(value, prefs.weightUnit), 0, mode)),
        unit: prefs.weightUnit,
      };
    case 'distance':
      return {
        value: withThousands(trimNumber(metersToDistance(value, prefs.distanceUnit), 2, mode)),
        unit: prefs.distanceUnit,
      };
    case 'duration': {
      const v = mode === 'floor' ? Math.floor(value) : Math.round(value);
      return { value: formatDuration(v), unit: '' };
    }
  }
}

export function formatMetricText(value: number, metric: Metric, prefs: UnitPrefs): string {
  const f = formatMetric(value, metric, prefs);
  return f.unit ? `${f.value} ${f.unit}` : f.value;
}

/** Formats "value / target unit" without ever showing a partial value as complete. */
export function formatProgress(
  value: number,
  target: number,
  metric: Metric,
  prefs: UnitPrefs,
): { value: string; target: string; unit: string } {
  const done = isComplete(value, target);
  const v = formatMetric(value, metric, prefs, done ? 'round' : 'floor');
  const t = formatMetric(target, metric, prefs);
  return { value: v.value, target: t.value, unit: metricUnit(metric, prefs, target) };
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${trimNumber(kgToWeight(kg, unit), 1)} ${unit}`;
}

export function formatDistance(m: number, unit: DistanceUnit): string {
  return `${trimNumber(metersToDistance(m, unit), 2)} ${unit}`;
}

/** Distance as a pool or track counts it: meters (or yards for mile users), e.g. "925 m". */
export function formatShortDistance(m: number, unit: DistanceUnit): string {
  return unit === 'km' ? `${Math.round(m)} m` : `${Math.round(m / 0.9144)} yd`;
}

/** How a sport talks about speed: pace per km/mi (foot sports), pace per 100 m (water), or km/h. */
export type SpeedStyle = 'pace' | 'pace100' | 'speed';

export function speedStyle(exerciseId: string): SpeedStyle {
  if (['running', 'walking', 'hiking'].includes(exerciseId)) return 'pace';
  if (exerciseId === 'swimming' || exerciseId === 'rowing') return 'pace100';
  return 'speed';
}

/** Speed from meters per second, e.g. "24.1 km/h" or "15 mi/h". */
export function formatSpeed(metersPerSec: number, unit: DistanceUnit): string {
  return `${trimNumber(metersToDistance(metersPerSec * 3600, unit), 1)} ${unit}/h`;
}

/** Pace for foot sports ("5:12 /km"), per 100 m for water sports, speed for everything else ("24.1 km/h"). */
export function formatPaceOrSpeed(
  exerciseId: string,
  distanceM: number,
  durationSec: number,
  unit: DistanceUnit,
): string | null {
  if (!distanceM || !durationSec) return null;
  switch (speedStyle(exerciseId)) {
    case 'pace':
      return `${formatDuration(durationSec / metersToDistance(distanceM, unit))} /${unit}`;
    case 'pace100':
      return `${formatDuration(durationSec / (distanceM / 100))} /100 m`;
    case 'speed':
      return formatSpeed(distanceM / durationSec, unit);
  }
}
