import type { DayKey } from './types';

/**
 * Day keys are plain calendar dates (YYYY-MM-DD) in the user's chosen time zone.
 * Calendar arithmetic on keys is done in UTC so it is immune to DST shifts.
 */

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function resolveTimeZone(setting: string): string {
  if (!setting || setting === 'auto') return deviceTimeZone();
  return isValidTimeZone(setting) ? setting : deviceTimeZone();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zonedParts(date: Date, tz: string): ZonedParts {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(tz, fmt);
  }
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dayKeyFor(date: Date, tz: string): DayKey {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Milliseconds until the next local midnight in `tz` (plus a small buffer). */
export function msUntilNextMidnight(now: Date, tz: string): number {
  const p = zonedParts(now, tz);
  const elapsed = (p.hour * 3600 + p.minute * 60 + p.second) * 1000 + now.getMilliseconds();
  return Math.max(1000, 24 * 3600 * 1000 - elapsed + 500);
}

function keyToUtc(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToKey(d: Date): DayKey {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = keyToUtc(key);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToKey(d);
}

export function addMonths(key: DayKey, n: number): DayKey {
  const d = keyToUtc(key);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return utcToKey(d);
}

/** 0 = Sunday */
export function weekday(key: DayKey): number {
  return keyToUtc(key).getUTCDay();
}

/** Monday-based week start. */
export function startOfWeek(key: DayKey): DayKey {
  const wd = weekday(key);
  return addDays(key, -((wd + 6) % 7));
}

export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

export function daysInMonth(key: DayKey): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((keyToUtc(a).getTime() - keyToUtc(b).getTime()) / 86400000);
}

export function rangeKeys(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export { WEEKDAY_SHORT, WEEKDAY_LETTER };

/** "Mon, Apr 28" */
export function formatDayShort(key: DayKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${WEEKDAY_SHORT[weekday(key)]}, ${MONTH_SHORT[m - 1]} ${d}`;
}

/** "Apr 28" */
export function formatMonthDay(key: DayKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

/** "April 2026" */
export function formatMonthYear(key: DayKey): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_LONG[m - 1]} ${y}`;
}

/** "Today", "Yesterday", "Tomorrow", or "Mon, Apr 28". */
export function formatRelativeDay(key: DayKey, today: DayKey): string {
  const diff = diffDays(key, today);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return formatDayShort(key);
}

/** "2h ago", "3d ago" relative to now. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "18:42" in the given zone. */
export function formatClock(iso: string, tz: string): string {
  const p = zonedParts(new Date(iso), tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export const COMMON_TIME_ZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Belgrade',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

/** The instant when the wall clock in `tz` shows `hour:minute` on `day` (DST-safe). */
export function zonedDateTime(day: DayKey, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wanted;
  // Two passes settle the zone offset, including on DST transition days.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  return new Date(guess);
}
