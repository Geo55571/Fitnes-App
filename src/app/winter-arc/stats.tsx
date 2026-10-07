import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Divider, EmptyState, ListRow, Screen, SectionHeader, StackHeader, Tag } from '@/components/ui';
import { formatDayShort, formatMonthDay } from '@/domain/dates';
import { RULE_LABEL, type ArcRule, type WeeklyProgress } from '@/domain/winterArc';
import { useWinterArc } from '@/hooks/winterArc';
import { colors, space, tabular, type } from '@/theme';

const RULES: ArcRule[] = ['nutrition', 'reading', 'discipline', 'strength', 'endurance'];

export default function ArcStatsScreen() {
  const { stats, today } = useWinterArc();
  const weeks = stats.weeks.filter((w) => w.state !== 'future' && w.state !== 'untracked').reverse();

  return (
    <Screen header={<StackHeader title="Statistics" />}>
      <View style={styles.grid}>
        <Tile value={stats.streaks.current} label="Current streak" />
        <Tile value={stats.streaks.longest} label="Longest streak" />
        <Tile value={stats.perfectDays} label="Perfect days" />
        <Tile value={stats.perfectWeeks} label="Perfect weeks" />
        <Tile value={stats.completion === null ? '–' : `${Math.round(stats.completion * 100)}%`} label="Requirements met" />
        <Tile value={stats.score.value ?? '–'} label="Discipline Score" onPress={() => router.push('/winter-arc/score')} />
      </View>

      <SectionHeader title="By rule" style={styles.section} />
      <Card padded={false} style={styles.clip}>
        <View style={[styles.tableRow, styles.tableHead]}>
          <Text style={[styles.cellName, type.caption]} />
          <Text style={styles.th}>Done</Text>
          <Text style={styles.th}>Excep.</Text>
          <Text style={styles.th}>Broken</Text>
          <Text style={styles.th}>Missed</Text>
        </View>
        {RULES.map((r) => {
          const c = stats.counts[r];
          const weekly = r === 'strength' || r === 'endurance';
          return (
            <View key={r}>
              <Divider />
              <View style={styles.tableRow}>
                <View style={styles.cellName}>
                  <Text style={type.body}>{RULE_LABEL[r]}</Text>
                  <Text style={type.caption}>{weekly ? 'weeks' : 'days'}</Text>
                </View>
                <Text style={[styles.td, tabular]}>{c.completed}</Text>
                <Text style={[styles.td, tabular]}>{c.exceptions}</Text>
                <Text style={[styles.td, tabular, c.violations > 0 && styles.broken]}>{weekly ? '–' : c.violations}</Text>
                <Text style={[styles.td, tabular]}>{c.missed}</Text>
              </View>
            </View>
          );
        })}
      </Card>
      <Text style={[type.caption, styles.foot]}>Approved exceptions are kept apart: they never count as broken or missed.</Text>

      <SectionHeader title="Weeks" style={styles.section} />
      <Card padded={false} style={styles.clip}>
        {weeks.length === 0 ? (
          <EmptyState icon="calendar-week" title="No weeks yet" />
        ) : (
          weeks.map((w, i) => (
            <View key={w.start}>
              {i > 0 && <Divider inset={space.lg} />}
              <ListRow
                title={`Week ${w.index}`}
                subtitle={`${formatMonthDay(w.from)} – ${formatMonthDay(w.to)} · ${weekLine(w)}`}
                right={<WeekTag week={w} />}
                onPress={() => router.push({ pathname: '/winter-arc/week', params: { start: w.start } })}
              />
            </View>
          ))
        )}
      </Card>

      <SectionHeader title="Exceptions and rule breaks" style={styles.section} />
      <Card padded={false} style={styles.clip}>
        {stats.events.length === 0 ? (
          <EmptyState icon="history" title="Nothing recorded" body="Rule breaks and approved exceptions appear here, with any note you add." />
        ) : (
          stats.events.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <Divider inset={space.lg} />}
              <Pressable
                onPress={() =>
                  e.week
                    ? router.push({ pathname: '/winter-arc/week', params: { start: e.week } })
                    : router.push({ pathname: '/winter-arc/day/[date]', params: { date: e.date } })
                }
                accessibilityRole="button"
                style={({ pressed }) => [styles.event, pressed && styles.pressed]}>
                <View style={styles.flex}>
                  <Text style={type.body}>
                    {RULE_LABEL[e.rule]}
                    <Text style={type.small}>  {e.week ? `week of ${formatMonthDay(e.week)}` : e.date === today ? 'Today' : formatDayShort(e.date)}</Text>
                  </Text>
                  {e.note ? <Text style={[type.small, styles.eventNote]}>{e.note}</Text> : null}
                </View>
                <Tag label={e.kind === 'exception' ? 'Exception' : 'Broken'} tone={e.kind === 'exception' ? 'neutral' : 'coral'} />
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

function weekLine(w: WeeklyProgress): string {
  const parts = [`${w.perfectDays}/${w.days.filter((d) => d.status !== 'future' && d.status !== 'untracked').length} perfect days`];
  if (w.weeklyApplies) parts.push(`strength ${w.strength.count} · endurance ${w.endurance.count}`);
  return parts.join(' · ');
}

function WeekTag({ week }: { week: WeeklyProgress }) {
  if (week.state === 'complete') return <Tag label="Perfect" tone="green" />;
  if (week.state === 'current') return <Tag label="This week" />;
  return <Tag label="Incomplete" />;
}

function Tile({ value, label, onPress }: { value: string | number; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]} accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={[styles.tileValue, tabular]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  clip: { overflow: 'hidden' },
  pressed: { backgroundColor: colors.surfaceMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: 2,
  },
  tileValue: { fontSize: 24, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  section: { marginTop: space.xl },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 10 },
  tableHead: { paddingVertical: 8 },
  cellName: { flex: 1.6 },
  th: { flex: 1, textAlign: 'right', fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  td: { flex: 1, textAlign: 'right', fontSize: 16, fontWeight: '600', color: colors.text },
  broken: { color: colors.danger },
  foot: { marginTop: space.sm },
  event: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  eventNote: { marginTop: 2 },
});
