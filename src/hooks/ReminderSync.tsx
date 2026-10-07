import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { planReminders } from '@/domain/reminders';
import { useStore } from '@/store/store';

import { remindersSupported, syncReminders } from './reminders';
import { useSelf } from './self';
import { useClock, useUnits } from './today';

/** Keeps scheduled notifications in line with the latest data (debounced). Renders nothing. */
export function ReminderSync() {
  const { today, tz } = useClock();
  const prefs = useUnits();
  const me = useSelf();
  const data = useStore(
    useShallow((s) => ({
      onboarded: s.profile.onboarded,
      settings: s.settings,
      sessions: s.sessions,
      goals: s.goals,
      goalChecks: s.goalChecks,
      groups: s.groups,
      people: s.people,
      peopleSessions: s.peopleSessions,
      challengeTotals: s.challengeTotals,
    })),
  );

  useEffect(() => {
    if (!remindersSupported || !data.onboarded) return;
    const timer = setTimeout(() => {
      const plan = planReminders({ ...data, now: new Date(), tz, today, prefs, me });
      syncReminders(plan).catch((e) => console.warn('Could not schedule reminders', e));
    }, 1500);
    return () => clearTimeout(timer);
  }, [data, today, tz, prefs, me]);

  return null;
}
