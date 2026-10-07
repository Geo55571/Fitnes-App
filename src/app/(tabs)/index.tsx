import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { GoalRow } from '@/components/GoalRow';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { StreakFlame } from '@/components/StreakFlame';
import { TrackerCard } from '@/components/TrackerCard';
import { AppHeader, Button, Card, Divider, ListRow, Screen, SectionHeader } from '@/components/ui';
import { addDays, formatDayShort, formatRelativeDay } from '@/domain/dates';
import { goalTitle } from '@/domain/describe';
import { getExercise } from '@/domain/exercises';
import { daySummary, goalsOn } from '@/domain/metrics';
import { computeStreak } from '@/domain/streak';
import type { TrackerConfig } from '@/domain/types';
import { useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { colors, MAX_CONTENT_WIDTH, space, type } from '@/theme';


export default function TodayScreen() {
  const today = useToday();
  const prefs = useUnits();
  const { width } = useWindowDimensions();
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

  const upcoming = useMemo(() => {
    const out: { date: string; title: string; id: string }[] = [];
    for (let i = 1; i <= 7 && out.length < 3; i++) {
      const d = addDays(today, i);
      for (const g of goalsOn(goals, d)) {
        if (g.schedule.type === 'daily') continue;
        out.push({ date: d, title: goalTitle(g, prefs), id: `${g.id}-${d}` });
        if (out.length >= 3) break;
      }
    }
    return out;
  }, [goals, today, prefs]);

  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH) - space.lg * 2;
  // Trackers float beside the streak only where they can't cover it (tablets, desktop);
  // on phones the streak stands alone, centred, and every tracker goes into the grid.
  const floatCount = contentWidth >= 500 ? Math.min(2, trackers.length) : 0;
  const floating = trackers.slice(0, floatCount);
  const grid = trackers.slice(floatCount);
  const stageHeight = Math.round(Math.max(330, Math.min(contentWidth * 1.0, 420)));
  const flameSize = Math.min(150, (Math.min(contentWidth, stageHeight) - 40) / 2.3);
  const floatWidth = Math.min(160, contentWidth * 0.3);

  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const openTracker = (t: TrackerConfig) => setQuickAdd(t.exerciseId);

  return (
    <Screen tab header={<AppHeader />}>
      <View style={[styles.stage, { height: stageHeight }]}>
        <View style={styles.flame}>
          <StreakFlame streak={streak} size={flameSize} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={type.title} accessibilityRole="header">
            Today
          </Text>
          <Text style={styles.date}>{formatDayShort(today)}</Text>
        </View>
        {floating.map((t, i) => (
          <TrackerCard
            key={`${t.exerciseId}-${t.metric}`}
            tracker={t}
            sessions={sessions}
            goals={goals}
            today={today}
            prefs={prefs}
            floating
            onPress={() => openTracker(t)}
            style={[styles.float, { width: floatWidth, top: stageHeight * 0.3 }, i === 0 ? { left: 0 } : { right: 0 }]}
          />
        ))}
      </View>

      {grid.length > 0 && (
        <View style={styles.grid}>
          {grid.map((t) => (
            <TrackerCard
              key={`${t.exerciseId}-${t.metric}`}
              tracker={t}
              sessions={sessions}
              goals={goals}
              today={today}
              prefs={prefs}
              onPress={() => openTracker(t)}
              compact={contentWidth < 330}
              style={styles.gridItem}
            />
          ))}
        </View>
      )}
      <Pressable onPress={() => router.push('/trackers')} style={styles.editTrackers} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.editText}>Edit trackers</Text>
      </Pressable>

      <Card style={styles.goals}>
        <SectionHeader
          title={summary.items.length || !summary.weekly.length ? 'Daily goals' : 'Goals'}
          right={summary.total ? `${summary.done} of ${summary.total} complete` : undefined}
          style={styles.goalsHeader}
        />
        {summary.items.length === 0 && summary.weekly.length === 0 ? (
          <Pressable onPress={() => router.push('/goal/new')} style={styles.noGoals} accessibilityRole="button">
            <Text style={type.small}>No goals for today yet.</Text>
            <Text style={styles.addGoal}>Add a goal</Text>
          </Pressable>
        ) : (
          summary.items.map((item, i) => (
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
          ))
        )}
        {summary.weekly.length > 0 && (
          <View style={styles.weekBlock}>
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
        <Button label="Log activity" icon="plus-circle-outline" onPress={() => router.navigate('/log')} style={styles.logBtn} />
      </Card>

      <Card padded={false} style={styles.upcoming}>
        <SectionHeader
          title="Upcoming plan"
          right="View all"
          onRightPress={() => router.navigate('/plan')}
          style={styles.upcomingHeader}
        />
        {upcoming.length === 0 ? (
          <Text style={[type.small, styles.upcomingEmpty]}>Nothing scheduled for the next 7 days.</Text>
        ) : (
          upcoming.map((u) => (
            <ListRow
              key={u.id}
              icon="calendar-blank-outline"
              title={u.title}
              subtitle={formatRelativeDay(u.date, today)}
              onPress={() => router.navigate({ pathname: '/plan', params: { date: u.date } })}
            />
          ))
        )}
      </Card>
      <QuickAddSheet exerciseId={quickAdd} onClose={() => setQuickAdd(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { marginHorizontal: -space.lg, marginTop: -4 },
  flame: { position: 'absolute', left: 0, right: 0, top: 28, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { position: 'absolute', left: space.lg, top: 4, pointerEvents: 'none' },
  date: { fontSize: 16, color: colors.textSecondary, marginTop: 2 },
  float: { position: 'absolute', marginHorizontal: space.lg },
  customize: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hint: { fontSize: 12, color: colors.textTertiary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm },
  gridItem: { flexBasis: '47%', flexGrow: 1 },
  editTrackers: { alignSelf: 'flex-end', paddingVertical: space.sm },
  editText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  goals: { marginTop: space.xs, paddingBottom: space.lg },
  goalsHeader: { marginBottom: 2 },
  noGoals: { paddingVertical: space.md, gap: 4 },
  addGoal: { fontSize: 15, fontWeight: '600', color: colors.primary },
  logBtn: { marginTop: space.md },
  weekBlock: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  weekHead: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: space.xs },
  upcoming: { marginTop: space.lg, paddingTop: space.lg, overflow: 'hidden' },
  upcomingHeader: { paddingHorizontal: space.lg, marginBottom: space.xs },
  upcomingEmpty: { paddingHorizontal: space.lg, paddingBottom: space.lg },
});
