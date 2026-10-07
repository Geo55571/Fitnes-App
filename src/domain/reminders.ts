import { addDays, startOfWeek, zonedDateTime } from './dates';
import { metricTitle } from './describe';
import { challengeState, groupLeaderboard, ME_ID, membersOf } from './groups';
import { currentStreak, daySummary, sessionsOn } from './metrics';
import { percentChange, weekComparison } from './trends';
import type { DayKey, Goal, Group, Person, Session, Settings } from './types';
import { formatMetricText, type UnitPrefs } from './units';

/**
 * Plans the local notifications FORM should have scheduled right now. Pure: the native
 * layer cancels what it scheduled before and schedules exactly this list. Re-planned
 * whenever data changes, so the text always reflects what's actually left to do.
 */

export interface PlannedNotification {
  id: string;
  at: Date;
  title: string;
  body: string;
}

export interface ReminderInput {
  now: Date;
  tz: string;
  today: DayKey;
  settings: Settings;
  prefs: UnitPrefs;
  sessions: Session[];
  goals: Goal[];
  goalChecks: Record<string, DayKey[]>;
  groups: Group[];
  people: Person[];
  peopleSessions: Session[];
  /** Synced totals for shared groups (challengeId → personId → value). */
  challengeTotals?: Record<string, Record<string, number>>;
  me: Person;
}

const STREAK_HOUR = 20;
const STREAK_MINUTE = 30;
const CHALLENGE_HOUR = 18;
const SUMMARY_HOUR = 19;

/** "3 push-ups, 2 km run and a plank" — what's left of today's per-day goals. */
export function goalGapText(input: ReminderInput, day: DayKey): { left: string[]; total: number } {
  const sum = daySummary(input.goals, day, input.sessions, input.goalChecks);
  const left: string[] = [];
  for (const item of sum.items) {
    if (item.done) continue;
    const g = item.goal;
    if (g.kind === 'todo') left.push(g.title);
    else {
      const rest = Math.max(0, item.target - item.value);
      const name = metricTitle(g.exerciseId!, g.metric).toLowerCase();
      // Reps read naturally ("3 push-ups"); other metrics keep their unit ("2 km run", "0:45 plank").
      left.push(g.metric === 'reps' ? `${Math.ceil(rest)} ${name}` : `${formatMetricText(rest, g.metric!, input.prefs)} ${name}`);
    }
  }
  return { left, total: sum.total };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function planReminders(input: ReminderInput): PlannedNotification[] {
  const { now, tz, today, settings } = input;
  const out: PlannedNotification[] = [];
  const future = (n: PlannedNotification) => n.at.getTime() > now.getTime() + 30_000 && out.push(n);

  // 1) Evening goal nudge: today with what's left, then the next 6 days with the day's goals.
  if (settings.reminderEnabled) {
    for (let i = 0; i < 7; i++) {
      const day = addDays(today, i);
      const at = zonedDateTime(day, settings.reminderHour, settings.reminderMinute, tz);
      const { left, total } = goalGapText(input, day);
      if (total === 0) {
        future({ id: `goal-${day}`, at, title: 'Time to move', body: 'Log today’s activity in FORM.' });
      } else if (left.length) {
        const shown = joinList(left.slice(0, 3)) + (left.length > 3 ? ` and ${left.length - 3} more` : '');
        future({ id: `goal-${day}`, at, title: i === 0 ? 'Almost there' : 'Today’s goals', body: `${shown} to go${i === 0 ? ' today' : ''}.` });
      }
      // All goals already done today → no nudge.
    }
  }

  // 2) Streak protection: tonight, only if nothing is logged today and the streak is worth keeping.
  if (settings.nudgeStreak) {
    const streak = currentStreak(input.sessions, today);
    if (streak >= 3 && sessionsOn(input.sessions, today).length === 0) {
      future({
        id: `streak-${today}`,
        at: zonedDateTime(today, STREAK_HOUR, STREAK_MINUTE, tz),
        title: `${streak}-day streak`,
        body: 'Nothing logged yet today. A quick session keeps your streak going.',
      });
    }
  }

  // 3) Challenges ending within the week: standing on the final day.
  if (settings.nudgeChallenges) {
    for (const g of input.groups) {
      const members = membersOf(g, input.people, input.me);
      for (const c of g.challenges) {
        if (challengeState(c, today) !== 'active' || c.endDate > addDays(today, 6)) continue;
        const rows = groupLeaderboard(g, c, members, input.sessions, input.peopleSessions, settings, input.challengeTotals ?? {});
        const mine = rows.find((r) => r.person.id === ME_ID);
        const leader = rows.find((r) => r.rank === 1 && r.person.id !== ME_ID);
        let body = `${c.title} ends today.`;
        if (mine?.rank === 1) body += ' You’re in the lead — hold on to it.';
        else if (mine?.rank && leader?.value != null && mine.value != null) {
          body += ` You’re #${mine.rank}, ${formatMetricText(leader.value - mine.value, c.metric, input.prefs)} behind ${leader.person.name}.`;
        }
        future({ id: `challenge-${c.id}`, at: zonedDateTime(c.endDate, CHALLENGE_HOUR, 0, tz), title: g.name, body });
      }
    }
  }

  // 4) Weekly summary: Sunday evening.
  if (settings.weeklySummary) {
    const sunday = addDays(startOfWeek(today), 6);
    const weekSessions = input.sessions.filter((s) => s.date >= startOfWeek(today) && s.date <= sunday);
    const days = new Set(weekSessions.map((s) => s.date)).size;
    const top = weekComparison(input.sessions, today).rows.find((r) => r.current > 0);
    let body = weekSessions.length
      ? `${weekSessions.length} sessions on ${days} ${days === 1 ? 'day' : 'days'}.`
      : 'No sessions logged this week yet. Next week is a fresh start.';
    if (top) {
      const pct = percentChange(top.current, top.previous);
      body += ` ${metricTitle(top.exerciseId, top.metric)}: ${formatMetricText(top.current, top.metric, input.prefs)}${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}.`;
    }
    future({ id: `week-${sunday}`, at: zonedDateTime(sunday, SUMMARY_HOUR, 0, tz), title: 'Your week', body });
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
