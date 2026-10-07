import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Screen, StackHeader } from '@/components/ui';
import { DAY_COLOR, DAY_LABEL } from '@/components/winterArc/parts';
import { addDays, formatMonthDay } from '@/domain/dates';
import type { ArcDayInfo, ArcDayStatus } from '@/domain/winterArc';
import { useWinterArc } from '@/hooks/winterArc';
import { colors, radius, space, tabular, type } from '@/theme';

const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEGEND: ArcDayStatus[] = ['perfect', 'excused', 'partial', 'failed', 'missed', 'future'];

/** The whole arc as a heatmap: one row per calendar week, one square per day. Tap a day to see or edit it. */
export default function ArcCalendarScreen() {
  const { stats, today } = useWinterArc();
  const byDate = new Map(stats.days.map((d) => [d.date, d]));

  return (
    <Screen header={<StackHeader title="Calendar" />}>
      <Text style={styles.summary}>
        <Text style={styles.strong}>{stats.perfectDays}</Text> perfect days · <Text style={styles.strong}>{stats.perfectWeeks}</Text> perfect weeks
      </Text>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.weekLabel} />
          {HEAD.map((h, i) => (
            <Text key={i} style={styles.head}>
              {h}
            </Text>
          ))}
        </View>
        {stats.weeks.map((w) => {
          const firstOfMonth = Array.from({ length: 7 }, (_, i) => addDays(w.start, i)).find((d) => d.endsWith('-01') || d === w.from);
          return (
            <View key={w.start} style={styles.row}>
              <Pressable
                style={styles.weekLabel}
                onPress={() => router.push({ pathname: '/winter-arc/week', params: { start: w.start } })}
                accessibilityRole="button"
                accessibilityLabel={`Week ${w.index}`}
                hitSlop={4}>
                <Text style={styles.month}>{firstOfMonth ? MONTH[Number(firstOfMonth.slice(5, 7)) - 1] : ''}</Text>
                <Text style={[styles.weekNum, tabular]}>W{w.index}</Text>
              </Pressable>
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(w.start, i);
                const info = byDate.get(d);
                return info ? <DayCell key={d} info={info} today={today} /> : <View key={d} style={styles.cellWrap} />;
              })}
            </View>
          );
        })}
      </Card>

      <View style={styles.legend}>
        {LEGEND.map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.swatch, swatch(s)]} />
            <Text style={type.caption}>{DAY_LABEL[s]}</Text>
          </View>
        ))}
      </View>
      <Text style={[type.caption, styles.hint]}>Tap a day to see and edit it. Tap a week number for the week.</Text>
    </Screen>
  );
}

function swatch(s: ArcDayStatus) {
  return s === 'future' ? { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border } : { backgroundColor: DAY_COLOR[s] };
}

function DayCell({ info, today }: { info: ArcDayInfo; today: string }) {
  const tappable = info.status !== 'future';
  const dark = info.status === 'perfect' || info.status === 'failed';
  const isToday = info.date === today;
  return (
    <View style={styles.cellWrap}>
      <Pressable
        disabled={!tappable}
        onPress={() => router.push({ pathname: '/winter-arc/day/[date]', params: { date: info.date } })}
        accessibilityRole="button"
        accessibilityLabel={`${formatMonthDay(info.date)}, ${DAY_LABEL[info.status]}`}
        style={({ pressed }) => [
          styles.cell,
          info.status === 'future' || info.status === 'open' ? styles.cellEmpty : { backgroundColor: DAY_COLOR[info.status] },
          info.status === 'untracked' && styles.cellUntracked,
          isToday && styles.cellToday,
          pressed && styles.cellPressed,
        ]}>
        <Text style={[styles.num, tabular, dark && styles.numDark, info.status === 'future' && styles.numFuture]}>{Number(info.date.slice(8))}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { ...type.body, color: colors.textSecondary, marginTop: space.xs, marginBottom: space.md },
  strong: { fontWeight: '700', color: colors.text },
  card: { paddingHorizontal: space.sm, paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  head: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.textTertiary, fontWeight: '500', paddingBottom: 4 },
  weekLabel: { width: 38, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 2 },
  month: { fontSize: 10, fontWeight: '700', color: colors.text, letterSpacing: 0.4 },
  weekNum: { fontSize: 10, color: colors.textTertiary },
  cellWrap: { flex: 1, aspectRatio: 1, padding: 2 },
  cell: { flex: 1, borderRadius: radius.sm - 2, alignItems: 'center', justifyContent: 'center' },
  cellEmpty: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  cellUntracked: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  cellToday: { borderWidth: 2, borderColor: colors.text },
  cellPressed: { opacity: 0.7 },
  num: { fontSize: 12, color: colors.text, fontWeight: '500' },
  numDark: { color: colors.onPrimary, fontWeight: '600' },
  numFuture: { color: colors.textTertiary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs, marginTop: space.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  hint: { textAlign: 'center', marginTop: space.sm },
});
