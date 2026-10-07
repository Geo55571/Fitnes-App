import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { dayKeyFor, msUntilNextMidnight, resolveTimeZone } from '@/domain/dates';
import type { DayKey } from '@/domain/types';
import type { UnitPrefs } from '@/domain/units';
import { useStore } from '@/store/store';

interface Clock {
  today: DayKey;
  tz: string;
}

const ClockContext = createContext<Clock | null>(null);

/**
 * Single source of "today" for the whole app. Rolls over at local midnight in the
 * user's chosen time zone, and re-checks whenever the app returns to the foreground
 * (timers don't fire while suspended).
 */
export function ClockProvider({ children }: { children: ReactNode }) {
  const tzSetting = useStore((s) => s.settings.timeZone);
  const tz = resolveTimeZone(tzSetting);
  const [today, setToday] = useState(() => dayKeyFor(new Date(), tz));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => setToday(dayKeyFor(new Date(), tz));
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, Math.min(msUntilNextMidnight(new Date(), tz), 60 * 60 * 1000));
    };
    refresh();
    schedule();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
        schedule();
      }
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [tz]);

  return <ClockContext.Provider value={{ today, tz }}>{children}</ClockContext.Provider>;
}

export function useClock(): Clock {
  const c = useContext(ClockContext);
  if (!c) throw new Error('useClock outside ClockProvider');
  return c;
}

export function useToday(): DayKey {
  return useClock().today;
}

export function useUnits(): UnitPrefs {
  return useStore(
    useShallow((s) => ({ distanceUnit: s.settings.distanceUnit, weightUnit: s.settings.weightUnit })),
  );
}
