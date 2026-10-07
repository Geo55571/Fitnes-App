import { useMemo } from 'react';

import { activeDaysInWindow, athleticLevel } from '@/domain/metrics';
import { useStore } from '@/store/store';

import { useToday } from './today';

/** The avatar's fitness look, driven by real consistency. */
export function useAthletic() {
  const today = useToday();
  const sessions = useStore((s) => s.sessions);
  const build = useStore((s) => s.avatar.build);
  return useMemo(() => {
    const activeDays = activeDaysInWindow(sessions, today, 28);
    return { activeDays, level: athleticLevel(build, activeDays) };
  }, [sessions, today, build]);
}
