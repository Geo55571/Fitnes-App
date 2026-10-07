import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { GoalRow } from '@/components/GoalRow';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { StreakFlame } from '@/components/StreakFlame';
import { TrackerCard } from '@/components/TrackerCard';
import { WinterArcCard } from '@/components/winterArc/WinterArcCard';
import { AppHeader, Card, Divider, Screen, ScreenTitle, SectionHeader } from '@/components/ui';
import { formatDayShort } from '@/domain/dates';
import { getExercise } from '@/domain/exercises';
import { daySummary } from '@/domain/metrics';
import { computeStreak } from '@/domain/streak';
import { useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { colors, space, type } from '@/theme';

/**
 * Today, top to bottom: the streak, today's goals, and one-tap logging for the trackers.
 * Everything else (the calendar, upcoming goals, suggestions) lives in Plan.
 */
export default function TodayScreen() {
  const today = useToday();
  const prefs = useUnits();
  const { sessions, goals, goalChecks, trackers, toggleTodo } = useStore(
    useShallow((s) => ({
      sessions: s.sessions,
      goals: s.goals,
      goalChecks: s.goalChecks,
      trackers: s.trackers,
      toggleTodo: s.toggleTodo,
    })),
  );

  const summary = useMemo(() => daySummary(goals, today, sessions, goalChecks), [goals, today, sessions, goalChecks]);
  const streak = useMemo(() => computeStreak(sessions, today), [sessions, today]);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const noGoals = summary.items.length === 0 && summary.weekly.length === 0;

  return (
    <Screen tab header={<AppHeader />}>
      <ScreenTitle title="Today" subtitle={formatDayShort(today)} />

      <View style={styles.stage}>
        <StreakFlame streak={streak} size={110} />
      </View>

      <WinterArcCard style={styles.block} />

      <Card style={styles.block}>
        <SectionHeader
          title={summary.total ? `Goals · ${summary.done}/${summary.total}` : 'Goals'}
          right="Plan"
          onRightPress={() => router.push('/plan')}
          style={styles.goalsHeader}
        />
        {noGoals ? (
          <Pressable onPress={() => router.push('/goal/new')} style={styles.noGoals} accessibilityRole="button">
            <Text style={type.small}>No goals for today.</Text>
            <Text style={styles.link}>Add a goal</Text>
          </Pressable>
        ) : (
          <>
            {summary.items.map((item, i) => (
              <View key={item.goal.id}>
                {i > 0 && <Divider />}
                <GoalRow
                  item={item}
                  prefs={prefs}
                  onToggle={() => toggleTodo(item.goal.id, today)}
                  onPress={
                    item.goal.kind === 'metric'
                      ? () =>
                          router.navigate({
                            pathname: '/log',
                            params: { exercise: item.goal.exerciseId, category: getExercise(item.goal.exerciseId).category },
                          })
                      : () => router.push({ pathname: '/goal/[id]', params: { id: item.goal.id } })
                  }
                />
              </View>
            ))}
            {summary.weekly.length > 0 && (
              <View style={summary.items.length ? styles.weekBlock : undefined}>
                <Text style={styles.weekHead}>This week</Text>
                {summary.weekly.map((item, i) => (
                  <View key={item.goal.id}>
                    {i > 0 && <Divider />}
                    <GoalRow
                      item={item}
                      prefs={prefs}
                      onToggle={() => toggleTodo(item.goal.id, today)}
                      onPress={() => router.push({ pathname: '/goal/[id]', params: { id: item.goal.id } })}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </Card>

      {trackers.length > 0 && (
        <View style={styles.block}>
          <SectionHeader title="Quick add" right="Edit" onRightPress={() => router.push('/trackers')} />
          <View style={styles.grid}>
            {trackers.map((t) => (
              <TrackerCard
                key={`${t.exerciseId}-${t.metric}`}
                tracker={t}
                sessions={sessions}
                goals={goals}
                today={today}
                prefs={prefs}
                onPress={() => setQuickAdd(t.exerciseId)}
                style={styles.gridItem}
              />
            ))}
          </View>
        </View>
      )}
      <QuickAddSheet exerciseId={quickAdd} onClose={() => setQuickAdd(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', marginTop: -space.md },
  block: { marginTop: space.lg },
  goalsHeader: { marginBottom: 2 },
  noGoals: { paddingVertical: space.sm, gap: 4 },
  link: { fontSize: 15, fontWeight: '600', color: colors.primary },
  weekBlock: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  weekHead: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gridItem: { flexBasis: '47%', flexGrow: 1 },
});
