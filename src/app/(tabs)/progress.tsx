import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { BarChart, type Bar } from '@/components/BarChart';
import { exerciseIconColor, Icon } from '@/components/Icon';
import { LineChart } from '@/components/LineChart';
import { SessionCard } from '@/components/SessionCard';
import { AppHeader, Button, Card, Chip, ChipRow, Divider, EmptyState, Screen, ScreenTitle, SectionHeader, Segmented } from '@/components/ui';
import { addDays, formatDayShort, formatMonthDay, startOfWeek, WEEKDAY_SHORT, weekday } from '@/domain/dates';
import { formatStat } from '@/domain/describe';
import { allExercises, getExercise, METRIC_LABEL, metricsFor, MUSCLE_LABEL, MUSCLES } from '@/domain/exercises';
import { bucketTotals, currentStreak, exercisesUsed, personalBests, type PersonalBest } from '@/domain/metrics';
import { exerciseTrend, muscleSets, percentChange, weekComparison } from '@/domain/trends';
import type { Metric } from '@/domain/types';
import { formatMetricText, type UnitPrefs } from '@/domain/units';
import { useClock, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { colors, space, tabular, type } from '@/theme';

type Range = 'week' | 'month' | 'quarter';

function formatRecord(pb: PersonalBest, prefs: UnitPrefs): string {
  return `${formatStat(pb.value, pb.format, prefs)}${pb.detail ? ` ${pb.detail}` : ''}`;
}

export default function ProgressScreen() {
  const { today, tz } = useClock();
  const prefs = useUnits();
  const params = useLocalSearchParams<{ exercise?: string }>();
  const { sessions, trackers } = useStore(useShallow((s) => ({ sessions: s.sessions, trackers: s.trackers })));

  const exerciseOptions = useMemo(() => {
    const ids = [...exercisesUsed(sessions), ...trackers.map((t) => t.exerciseId)];
    return ids.filter((id, i) => ids.indexOf(id) === i);
  }, [sessions, trackers]);

  const [exerciseId, setExerciseId] = useState(params.exercise ?? exerciseOptions[0] ?? 'pushups');
  const [metric, setMetric] = useState<Metric>(metricsFor(getExercise(exerciseId).kind)[0]);
  const [range, setRange] = useState<Range>('week');
  const [historyLimit, setHistoryLimit] = useState(6);

  const selectExercise = (id: string) => {
    setExerciseId(id);
    setMetric(metricsFor(getExercise(id).kind)[0]);
    setHistoryLimit(6);
  };

  // Follow a tracker tap from Today.
  const [appliedParam, setAppliedParam] = useState(params.exercise);
  if (params.exercise !== appliedParam) {
    setAppliedParam(params.exercise);
    if (params.exercise) selectExercise(params.exercise);
  }

  const ex = getExercise(exerciseId);

  const buckets = useMemo(() => {
    if (range === 'quarter') {
      const thisWeek = startOfWeek(today);
      return Array.from({ length: 13 }, (_, i) => {
        const start = addDays(thisWeek, -7 * (12 - i));
        const end = addDays(start, 6) > today ? today : addDays(start, 6);
        return { start, end, label: i % 4 === 0 ? formatMonthDay(start) : '', title: `Week of ${formatMonthDay(start)}` };
      });
    }
    const n = range === 'week' ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const d = addDays(today, -(n - 1 - i));
      const label = range === 'week' ? WEEKDAY_SHORT[weekday(d)] : (n - 1 - i) % 7 === 0 ? formatMonthDay(d) : '';
      return { start: d, end: d, label, title: formatDayShort(d) };
    });
  }, [range, today]);

  const totals = useMemo(() => bucketTotals(sessions, buckets, exerciseId, metric), [sessions, buckets, exerciseId, metric]);
  const bars: Bar[] = buckets.map((b, i) => ({ key: b.start, value: totals[i], label: b.label, title: b.title }));
  const rangeTotal = totals.reduce((a, b) => a + b, 0);
  const activeBuckets = totals.filter((v) => v > 0).length;
  const best = Math.max(0, ...totals);
  const fmt = (v: number) => formatMetricText(v, metric, prefs);

  const records = useMemo(() => personalBests(sessions, exerciseId), [sessions, exerciseId]);
  const history = useMemo(
    () =>
      sessions
        .filter((s) => s.entries.some((e) => e.exerciseId === exerciseId))
        .sort((a, b) => (b.date === a.date ? b.performedAt.localeCompare(a.performedAt) : b.date.localeCompare(a.date))),
    [sessions, exerciseId],
  );

  // Week at a glance (Mon → today), across all exercises.
  const weekStart = startOfWeek(today);
  const weekSessions = sessions.filter((s) => s.date >= weekStart && s.date <= today);
  const weekDays = new Set(weekSessions.map((s) => s.date)).size;
  const streak = currentStreak(sessions, today);

  const bucketWord = range === 'quarter' ? 'weeks' : 'days';

  const [showAllWeek, setShowAllWeek] = useState(false);
  const comparison = useMemo(() => weekComparison(sessions, today), [sessions, today]);
  const trend = useMemo(() => exerciseTrend(sessions, exerciseId, today), [sessions, exerciseId, today]);
  const muscles = useMemo(() => {
    const last7 = muscleSets(sessions, addDays(today, -6), today);
    const prior = muscleSets(sessions, addDays(today, -34), addDays(today, -7));
    const rows = MUSCLES.map((m) => ({ muscle: m, sets: last7[m], avg: prior[m] / 4 }));
    return { rows, max: Math.max(1, ...rows.map((r) => Math.max(r.sets, r.avg))) };
  }, [sessions, today]);

  return (
    <Screen tab header={<AppHeader />}>
      <ScreenTitle title="Progress" />

      <Card style={styles.week}>
        <Stat label="Sessions this week" value={String(weekSessions.length)} />
        <View style={styles.vr} />
        <Stat label="Active this week" value={`${weekDays}/7`} />
        <View style={styles.vr} />
        <Stat label="Day streak" value={String(streak)} />
      </Card>

      <SectionHeader title="This week" right="vs same days last week" style={styles.weekHead} />
      <Card padded={false} style={styles.clip}>
        {comparison.rows.length === 0 ? (
          <Text style={[type.small, styles.pad]}>Nothing logged this week or the same days last week.</Text>
        ) : (
          <>
            {(showAllWeek ? comparison.rows : comparison.rows.slice(0, 4)).map((r, i) => {
              const e = getExercise(r.exerciseId);
              const pct = percentChange(r.current, r.previous);
              return (
                <View key={r.exerciseId}>
                  {i > 0 && <Divider inset={56} />}
                  <View style={styles.cmpRow}>
                    <Icon name={e.icon} size={22} color={exerciseIconColor(e.id)} />
                    <View style={styles.flex}>
                      <Text style={type.body} numberOfLines={1}>
                        {e.name}
                      </Text>
                      <Text style={type.caption}>was {formatMetricText(r.previous, r.metric, prefs)}</Text>
                    </View>
                    <Text style={[type.bodyStrong, tabular]}>{formatMetricText(r.current, r.metric, prefs)}</Text>
                    <Delta pct={pct} isNew={r.previous === 0 && r.current > 0} />
                  </View>
                </View>
              );
            })}
            {comparison.rows.length > 4 && (
              <Text style={styles.showAll} onPress={() => setShowAllWeek((v) => !v)} accessibilityRole="button">
                {showAllWeek ? 'Show less' : `Show all ${comparison.rows.length}`}
              </Text>
            )}
          </>
        )}
      </Card>

      <ChipRow>
        {(exerciseOptions.length ? exerciseOptions : allExercises().slice(0, 6).map((e) => e.id)).map((id) => {
          const e = getExercise(id);
          return (
            <Chip key={id} label={e.name} icon={e.icon} iconColor={exerciseIconColor(id)} selected={id === exerciseId} onPress={() => selectExercise(id)} />
          );
        })}
      </ChipRow>

      <Card style={styles.chartCard}>
        <View style={styles.chartHead}>
          <Text style={type.section}>{ex.name}</Text>
          {metricsFor(ex.kind).length > 1 && (
            <View style={styles.metricRow}>
              {metricsFor(ex.kind).map((m) => (
                <Text
                  key={m}
                  onPress={() => setMetric(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: m === metric }}
                  style={[styles.metric, m === metric && styles.metricOn]}>
                  {METRIC_LABEL[m]}
                </Text>
              ))}
            </View>
          )}
        </View>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: 'week', label: '7 days' },
            { value: 'month', label: '30 days' },
            { value: 'quarter', label: '13 weeks' },
          ]}
        />
        <View style={styles.chart}>
          <BarChart key={`${exerciseId}-${metric}-${range}`} bars={bars} format={fmt} />
        </View>
        <Divider />
        <View style={styles.statsRow}>
          <Stat label={`Total`} value={fmt(rangeTotal)} small />
          <Stat label={bucketWord === 'days' ? 'Days active' : 'Weeks active'} value={`${activeBuckets}/${buckets.length}`} small />
          <Stat label={range === 'quarter' ? 'Best week' : 'Best day'} value={best ? fmt(best) : '–'} small />
        </View>
      </Card>

      <SectionHeader title={trend.title} right="Last 90 days" style={styles.section} />
      <Card>
        {trend.points.length >= 2 ? (
          <>
            <LineChart key={`${exerciseId}-${trend.format}`} points={trend.points} format={(v) => formatStat(v, trend.format, prefs)} />
            <Text style={[type.caption, styles.caption]}>{trend.caption}</Text>
          </>
        ) : (
          <Text style={type.small}>Log {ex.name.toLowerCase()} on a few more days to see a trend.</Text>
        )}
      </Card>

      <SectionHeader title="Muscle groups" right="Sets, last 7 days" style={styles.section} />
      <Card>
        {muscles.rows.map((r) => (
          <View
            key={r.muscle}
            style={styles.muscleRow}
            accessible
            accessibilityLabel={`${MUSCLE_LABEL[r.muscle]}: ${r.sets} sets, 4-week average ${Math.round(r.avg)}`}>
            <Text style={[type.small, styles.muscleLabel]}>{MUSCLE_LABEL[r.muscle]}</Text>
            <View style={styles.muscleTrack}>
              <View style={[styles.muscleBar, { width: `${(r.sets / muscles.max) * 100}%` }]} />
              {r.avg > 0 && <View style={[styles.avgTick, { left: `${(r.avg / muscles.max) * 100}%` }]} />}
            </View>
            <Text style={[type.bodyStrong, tabular, styles.muscleValue]}>{r.sets}</Text>
          </View>
        ))}
        <View style={styles.legendRow}>
          <View style={styles.legendTick} />
          <Text style={type.caption}>Your weekly average over the 4 weeks before</Text>
        </View>
      </Card>

      <SectionHeader title="Personal bests" style={styles.section} />
      <Card padded={false}>
        {records.length === 0 ? (
          <Text style={[type.small, styles.pad]}>Log {ex.name.toLowerCase()} to start setting records.</Text>
        ) : (
          records.map((r, i) => (
            <View key={r.key}>
              {i > 0 && <Divider inset={space.lg} />}
              <View style={styles.record}>
                <View style={styles.flex}>
                  <Text style={type.body}>{r.label}</Text>
                  <Text style={type.caption}>{formatDayShort(r.date)}</Text>
                </View>
                <Text style={[type.bodyStrong, tabular]}>{formatRecord(r, prefs)}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <SectionHeader title="History" right={history.length ? `${history.length} sessions` : undefined} style={styles.section} />
      {history.length === 0 ? (
        <Card>
          <EmptyState icon="chart-bar" title="No sessions yet" body={`Sessions with ${ex.name.toLowerCase()} will appear here.`} />
        </Card>
      ) : (
        <>
          {history.slice(0, historyLimit).map((s) => (
            <SessionCard key={s.id} session={s} prefs={prefs} tz={tz} today={today} showDate onlyExerciseId={exerciseId} />
          ))}
          {history.length > historyLimit && (
            <Button label="Show more" variant="secondary" compact onPress={() => setHistoryLimit((n) => n + 10)} />
          )}
        </>
      )}
    </Screen>
  );
}

function Delta({ pct, isNew }: { pct: number | null; isNew: boolean }) {
  if (isNew) return <Text style={styles.delta}>New</Text>;
  if (pct === null) return <Text style={styles.delta}>–</Text>;
  const up = pct > 0;
  return (
    <View style={styles.deltaWrap} accessible accessibilityLabel={`${up ? 'up' : pct < 0 ? 'down' : 'no change'} ${Math.abs(pct)} percent`}>
      {pct !== 0 && <Icon name={up ? 'arrow-up' : 'arrow-down'} size={14} color={up ? colors.primary : colors.textSecondary} />}
      <Text style={[styles.delta, tabular]}>{Math.abs(pct)}%</Text>
    </View>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[small ? styles.statValueSmall : styles.statValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={type.caption} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  week: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg, paddingVertical: space.md },
  vr: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
  statValueSmall: { fontSize: 16, fontWeight: '600', color: colors.text },
  chartCard: { marginTop: space.md },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md, gap: space.sm },
  metricRow: { flexDirection: 'row', gap: 4 },
  metric: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  metricOn: { backgroundColor: colors.primarySoft, color: colors.primary, fontWeight: '600' },
  chart: { marginTop: space.lg, marginBottom: space.md },
  statsRow: { flexDirection: 'row', paddingTop: space.md },
  section: { marginTop: space.xl },
  pad: { padding: space.lg },
  weekHead: { marginTop: space.xs },
  clip: { overflow: 'hidden', marginBottom: space.lg },
  cmpRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 11 },
  deltaWrap: { flexDirection: 'row', alignItems: 'center', minWidth: 52, justifyContent: 'flex-end' },
  delta: { fontSize: 13, color: colors.textSecondary, minWidth: 40, textAlign: 'right' },
  showAll: { fontSize: 14, fontWeight: '600', color: colors.primary, padding: space.lg, paddingTop: space.sm },
  caption: { marginTop: space.sm },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 },
  muscleLabel: { width: 72, color: colors.text },
  muscleTrack: { flex: 1, height: 10, justifyContent: 'center' },
  muscleBar: { height: 10, borderRadius: 4, backgroundColor: colors.primary, minWidth: 2 },
  avgTick: { position: 'absolute', width: 2, height: 16, marginLeft: -1, backgroundColor: colors.text, borderRadius: 1 },
  muscleValue: { width: 28, textAlign: 'right' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  legendTick: { width: 2, height: 12, backgroundColor: colors.text, borderRadius: 1 },
  record: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 12, gap: space.md },
});
