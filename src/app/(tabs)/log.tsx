import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { SessionCard } from '@/components/SessionCard';
import { SessionEditor } from '@/components/SessionEditor';
import { RestTimerBar, useRestActive } from '@/components/timers';
import { showToast } from '@/components/toast';
import { AppHeader, Screen, ScreenTitle, SectionHeader } from '@/components/ui';
import { formatRelativeDay } from '@/domain/dates';
import { sessionsOn } from '@/domain/metrics';
import type { Category } from '@/domain/types';
import { goalFeedback } from '@/hooks/saveFeedback';
import { useClock, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { space, type } from '@/theme';

export default function LogScreen() {
  const { today, tz } = useClock();
  const prefs = useUnits();
  const params = useLocalSearchParams<{ exercise?: string; category?: Category }>();
  const { sessions, addSession } = useStore(useShallow((s) => ({ sessions: s.sessions, addSession: s.addSession })));
  const [pickedDate, setDate] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const resting = useRestActive();

  // Follow the calendar day unless the user deliberately picked another one.
  const date = pickedDate && pickedDate <= today ? pickedDate : today;
  const daySessions = useMemo(() => sessionsOn(sessions, date).reverse(), [sessions, date]);

  return (
    <Screen tab header={<AppHeader />} footer={resting ? <RestTimerBar /> : undefined}>
      <ScreenTitle title="Log activity" />
      <SessionEditor
        key={`${params.exercise ?? ''}-${params.category ?? ''}-${resetCount}`}
        prefs={prefs}
        sessions={sessions}
        today={today}
        date={date}
        onDateChange={(d) => setDate(d === today ? null : d)}
        initialCategory={params.category}
        initialExerciseId={params.exercise}
        saveLabel="Save session"
        onSave={(input) => {
          addSession(input);
          showToast(goalFeedback(input, today, prefs));
          setResetCount((c) => c + 1);
        }}
      />

      <View style={styles.list}>
        <SectionHeader
          title={`${formatRelativeDay(date, today)}’s sessions`}
          right={daySessions.length ? String(daySessions.length) : undefined}
        />
        {daySessions.length === 0 ? (
          <Text style={type.small}>Nothing logged {date === today ? 'yet today' : 'on this day'}.</Text>
        ) : (
          daySessions.map((s) => <SessionCard key={s.id} session={s} prefs={prefs} tz={tz} today={today} />)
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: space.xxl },
});
