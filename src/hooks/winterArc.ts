import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { arcStatistics, type ChallengeStatistics, type WinterArcData } from '@/domain/winterArc';
import { useStore } from '@/store/store';

import { useToday } from './today';

/** Winter Arc data plus everything derived from it (days, weeks, streaks, score), recomputed on any change. */
export function useWinterArc(): { data: WinterArcData; stats: ChallengeStatistics; today: string; joined: boolean } {
  const today = useToday();
  const { data, sessions } = useStore(useShallow((s) => ({ data: s.winterArc, sessions: s.sessions })));
  const stats = useMemo(() => arcStatistics({ data, sessions, today }), [data, sessions, today]);
  return { data, stats, today, joined: !!data.joinedAt };
}
