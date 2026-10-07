import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Calendar, type DayStatus } from '@/components/Calendar';
import { GoalRow } from '@/components/GoalRow';
import { exerciseIconColor, Icon } from '@/components/Icon';
import { showToast } from '@/components/toast';
import { AppHeader, Button, Card, Divider, ListRow, Screen, ScreenTitle, SectionHeader } from '@/components/ui';
import { formatRelativeDay, startOfMonth } from '@/domain/dates';
import { describeEntry, goalTitle, scheduleLabel } from '@/domain/describe';
import { getExercise } from '@/domain/exercises';
import { suggestGoals } from '@/domain/goals';
import { daySummary } from '@/domain/metrics';
import { formatMetricText } from '@/domain/units';
import type { DayKey, Session } from '@/domain/types';
import { useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { colors, radius, space, type } from '@/theme';

export default function PlanScreen() {
  const today = useToday();
  const prefs = useUnits();
  const params = useLocalSearchParams<{ date?: string }>();
  const { sessions, goals, goalChecks, toggleTodo, addGoal } = useStore(
    useShallow((s) => ({ sessions: s.sessions, goals: s.goals, goalChecks: s.goalChecks, toggleTodo: s.toggleTodo, addGoal: s.addGoal })),
  );
  const suggestions = useMemo(() => suggestGoals(sessions, goals, today, prefs), [sessions, goals, today, prefs]);
  const [selected, setSelected] = useState<DayKey>(params.date ?? today);
  const [month, setMonth] = useState<DayKey>(startOfMonth(params.date ?? today));

  // When the day rolls over, move along with it unless another day was picked.
  const [lastToday, setLastToday] = useState(today);
  if (today !== lastToday) {
    setLastToday(today);
    if (selected === lastToday) {
      setSelected(today);
      setMonth(startOfMonth(today));
    }
  }

  // Jump to a date passed in the route (e.g. from Today's upcoming list).
  const [appliedParam, setAppliedParam] = useState(params.date);
  if (params.date !== appliedParam) {
    setAppliedParam(params.date);
    if (params.date) {
      setSelected(params.date);
      setMonth(startOfMonth(params.date));
    }
  }

  const byDate = useMemo(() => {
    const m = new Map<DayKey, Session[]>();
    for (const s of sessions) {
      const arr = m.get(s.date);
      if (arr) arr.push(s);
      else m.set(s.date, [s]);
    }
    return m;
  }, [sessions]);

  const statusFor = (d: DayKey): DayStatus => {
    const daySessions = byDate.get(d) ?? [];
    const sum = daySummary(goals, d, daySessions, goalChecks);
    if (!sum.total) return daySessions.length && d <= today ? 'logged' : 'none';
    if (d > today) return 'scheduled';
    if (sum.done === sum.total) return 'done';
    if (sum.done > 0 || sum.items.some((i) => i.fraction > 0)) return 'partial';
    return d === today ? 'scheduled' : 'missed';
  };

  const summary = daySummary(goals, selected, byDate.get(selected) ?? [], goalChecks);
  const activeGoals = goals.filter((g) => !g.endDate || g.endDate >= today).filter((g) => g.schedule.type !== 'once' || g.schedule.date >= today);
  const isFuture = selected > today;
  const logged = (byDate.get(selected) ?? []).flatMap((sess) => sess.entries.map((entry) => ({ key: `${sess.id}-${entry.id}`, entry })));

  return (
    <Screen tab header={<AppHeader />}>
      <ScreenTitle
        title="Plan"
        right={<Button label="Goal" icon="plus" compact onPress={() => router.push({ pathname: '/goal/[id]', params: { id: 'new', date: selected } })} />}
      />
      <Card>
        <Calendar
          month={month}
          selected={selected}
          today={today}
          statusFor={statusFor}
          onSelect={setSelected}
          onMonthChange={setMonth}
        />
      </Card>

      <View style={styles.day}>
        <SectionHeader
          title={formatRelativeDay(selected, today)}
          right={summary.total ? (isFuture ? `${summary.total} planned` : `${summary.done} of ${summary.total} complete`) : undefined}
        />
        <Card style={styles.dayCard}>
          {summary.items.length === 0 && summary.weekly.length === 0 ? (
            <Text style={[type.small, styles.empty]}>No goals on this day.</Text>
          ) : (
            summary.items.map((item, i) => (
              <View key={item.goal.id}>
                {i > 0 && <Divider />}
                <GoalRow
                  item={item}
                  prefs={prefs}
                  showSchedule
                  disabled={isFuture}
                  onToggle={() => toggleTodo(item.goal.id, selected)}
                  onPress={() => router.push({ pathname: '/goal/[id]', params: { id: item.goal.id } })}
                />
              </View>
            ))
          )}
          {summary.weekly.length > 0 && (
            <View style={summary.items.length ? styles.weekBlock : undefined}>
              <Text style={styles.weekHead}>That week</Text>
              {summary.weekly.map((item, i) => (
                <View key={item.goal.id}>
                  {i > 0 && <Divider />}
                  <GoalRow
                    item={item}
                    prefs={prefs}
                    disabled={isFuture}
                    onToggle={() => toggleTodo(item.goal.id, selected)}
                    onPress={() => router.push({ pathname: '/goal/[id]', params: { id: item.goal.id } })}
                  />
                </View>
              ))}
            </View>
          )}
        </Card>
        {logged.length > 0 && (
          <Card padded={false} style={styles.loggedCard}>
            <Text style={[styles.weekHead, styles.loggedHead]}>Logged</Text>
            {logged.map(({ key, entry }, i) => {
              const ex = getExercise(entry.exerciseId);
              return (
                <View key={key}>
                  {i > 0 && <Divider inset={52} />}
                  <View style={styles.loggedRow}>
                    <Icon name={ex.icon} size={20} color={exerciseIconColor(ex.id)} />
                    <Text style={[type.body, styles.flex]} numberOfLines={1}>
                      {ex.name}
                    </Text>
                    <Text style={[type.small, styles.loggedDesc]} numberOfLines={1}>
                      {describeEntry(entry, prefs)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
        {selected < today && summary.items.some((i) => i.goal.kind === 'metric') && (
          <Text style={[type.caption, styles.note]}>Past days show what you logged on that day. Log or edit sessions for that day in Log.</Text>
        )}
      </View>

      <View style={styles.all}>
        <SectionHeader title="Your goals" right={activeGoals.length ? String(activeGoals.length) : undefined} />
        <Card padded={false} style={styles.allCard}>
          {activeGoals.length === 0 ? (
            <View style={styles.allEmpty}>
              <Text style={type.small}>Create a daily or scheduled goal. Logged activity counts toward it automatically.</Text>
              <Button label="New goal" icon="plus" variant="secondary" compact onPress={() => router.push('/goal/new')} style={styles.newBtn} />
            </View>
          ) : (
            activeGoals.map((g, i) => (
              <View key={g.id}>
                {i > 0 && <Divider inset={56} />}
                <ListRow
                  icon={g.kind === 'todo' ? 'check-circle' : getExercise(g.exerciseId).icon}
                  iconColor={g.kind === 'todo' ? colors.textSecondary : g.exerciseId === 'pushups' ? colors.coral : colors.text}
                  title={goalTitle(g, prefs)}
                  subtitle={`${scheduleLabel(g.schedule)}${g.autoIncrease ? ' · raises automatically' : ''}${g.startDate > today ? ` · from ${formatRelativeDay(g.startDate, today)}` : ''}`}
                  onPress={() => router.push({ pathname: '/goal/[id]', params: { id: g.id } })}
                />
              </View>
            ))
          )}
        </Card>
      </View>

      {suggestions.length > 0 && (
        <View style={styles.all}>
          <SectionHeader title="Suggested for you" right="From your last 4 weeks" />
          {suggestions.map((sg) => {
            const ex = getExercise(sg.exerciseId);
            const per = sg.schedule.type === 'weekly' ? 'a week' : 'a day';
            return (
              <View key={sg.key} style={styles.suggestion}>
                <View style={styles.flex}>
                  <Text style={type.bodyStrong}>
                    {ex.name} · {formatMetricText(sg.target, sg.metric, prefs)} {sg.schedule.type === 'weekly' ? 'per week' : 'daily'}
                  </Text>
                  <Text style={[type.small, styles.reason]}>
                    Done on {sg.activeDays} of the last 28 days, usually {formatMetricText(sg.typical, sg.metric, prefs)} {per}.
                  </Text>
                </View>
                <Button
                  label="Add"
                  compact
                  variant="secondary"
                  onPress={() => {
                    addGoal({ kind: 'metric', title: '', exerciseId: sg.exerciseId, metric: sg.metric, target: sg.target, schedule: sg.schedule }, today);
                    showToast(`Goal added: ${ex.name}`);
                  }}
                />
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  day: { marginTop: space.xl },
  dayCard: { paddingVertical: space.xs },
  empty: { paddingVertical: space.md },
  note: { marginTop: space.sm },
  loggedCard: { marginTop: space.md, overflow: 'hidden' },
  loggedHead: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  loggedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 11 },
  loggedDesc: { flexShrink: 1, maxWidth: '55%', textAlign: 'right' },
  all: { marginTop: space.xl },
  allCard: { overflow: 'hidden' },
  allEmpty: { padding: space.lg, gap: space.md },
  newBtn: { alignSelf: 'flex-start' },
  flex: { flex: 1, minWidth: 0 },
  weekBlock: { marginTop: space.xs, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  weekHead: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: space.xs },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reason: { marginTop: 2 },
});
