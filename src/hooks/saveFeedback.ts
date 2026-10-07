import { metricTitle } from '@/domain/describe';
import { goalAppliesOn, goalProgress } from '@/domain/metrics';
import type { DayKey } from '@/domain/types';
import { formatProgress, isComplete, type UnitPrefs } from '@/domain/units';
import { useStore } from '@/store/store';

/** Confirmation text after saving, showing how the save moved matching goals (read from the saved store). */
export function goalFeedback(session: { date: DayKey; entries: { exerciseId: string }[] }, today: DayKey, prefs: UnitPrefs): string {
  const { goals, sessions } = useStore.getState();
  const parts: string[] = [];
  for (const g of goals) {
    if (g.kind !== 'metric' || !goalAppliesOn(g, session.date)) continue;
    if (!session.entries.some((e) => e.exerciseId === g.exerciseId)) continue;
    const progress = goalProgress(g, session.date, sessions, {});
    const p = formatProgress(progress.value, g.target!, g.metric!, prefs);
    const unit = g.metric === 'reps' || g.metric === 'sets' ? '' : ` ${p.unit}`;
    const week = progress.period === 'week' ? ' this week' : '';
    parts.push(`${metricTitle(g.exerciseId!, g.metric)} ${p.value}/${p.target}${unit}${week}${isComplete(progress.value, g.target!) ? ' ✓' : ''}`);
  }
  const when = session.date === today ? '' : ' to past day';
  return parts.length ? `Saved${when} · ${parts.slice(0, 2).join(' · ')}` : `Session saved${when}`;
}
