import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showToast, ToastHost } from '@/components/toast';
import { metricTitle } from '@/domain/describe';
import { formatMetricText } from '@/domain/units';
import { ReminderSync } from '@/hooks/ReminderSync';
import { ClockProvider, useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { SyncRunner } from '@/sync/SyncRunner';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const subscribeHydration = (cb: () => void) => useStore.persist.onFinishHydration(cb);
const getHydrated = () => useStore.persist.hasHydrated();

function useHydrated() {
  return useSyncExternalStore(subscribeHydration, getHydrated, getHydrated);
}

/** Once per day: raise goals that earned it last week, and say so. */
function GoalMaintenance() {
  const today = useToday();
  const prefs = useUnits();
  const onboarded = useStore((s) => s.profile.onboarded);
  const runProgressions = useStore((s) => s.runProgressions);
  useEffect(() => {
    if (!onboarded) return;
    const raised = runProgressions(today);
    if (raised.length) {
      const [first] = raised;
      const what = `${metricTitle(first.goal.exerciseId!, first.goal.metric)} → ${formatMetricText(first.goal.target!, first.goal.metric!, prefs)}`;
      showToast(`Strong week! Goal raised: ${what}${raised.length > 1 ? ` (+${raised.length - 1} more)` : ''}`);
    }
  }, [today, onboarded, runProgressions, prefs]);
  return null;
}

export default function RootLayout() {
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    <SafeAreaProvider>
      <ClockProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
        </Stack>
        <GoalMaintenance />
        <ReminderSync />
        <SyncRunner />
        <ToastHost />
      </ClockProvider>
    </SafeAreaProvider>
  );
}
