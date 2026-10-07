import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  addDays,
  addMonths,
  daysInMonth,
  formatMonthYear,
  startOfMonth,
  weekday,
} from '@/domain/dates';
import type { DayKey } from '@/domain/types';
import { colors, space, tabular, type } from '@/theme';

import { IconButton } from './ui';

/** Goal status for a day; 'logged' means activity on a day without goals. */
export type DayStatus = 'none' | 'done' | 'partial' | 'missed' | 'scheduled' | 'logged';

interface Props {
  month: DayKey; // any day within the displayed month
  selected: DayKey;
  today: DayKey;
  statusFor: (d: DayKey) => DayStatus;
  onSelect: (d: DayKey) => void;
  onMonthChange: (m: DayKey) => void;
}

const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function Calendar({ month, selected, today, statusFor, onSelect, onMonthChange }: Props) {
  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const lead = (weekday(first) + 6) % 7; // Monday-first
    const count = daysInMonth(month);
    const out: (DayKey | null)[] = Array(lead).fill(null);
    for (let i = 0; i < count; i++) out.push(addDays(first, i));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const weeks: (DayKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={styles.header}>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => onMonthChange(addMonths(month, -1))} />
        <Text style={type.section}>{formatMonthYear(month)}</Text>
        <IconButton icon="chevron-right" label="Next month" onPress={() => onMonthChange(addMonths(month, 1))} />
      </View>
      <View style={styles.week}>
        {HEAD.map((h, i) => (
          <Text key={i} style={styles.head}>
            {h}
          </Text>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.week}>
          {w.map((d, di) => {
            if (!d) return <View key={di} style={styles.cell} />;
            const isSel = d === selected;
            const isToday = d === today;
            const status = statusFor(d);
            return (
              <Pressable
                key={d}
                onPress={() => onSelect(d)}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${d}${isToday ? ', today' : ''}${status !== 'none' ? `, ${status === 'logged' ? 'active' : status}` : ''}`}>
                <View style={[styles.day, isToday && styles.today, isSel && styles.selected]}>
                  <Text style={[styles.num, tabular, isSel && styles.numSel, isToday && !isSel && styles.numToday]}>
                    {Number(d.slice(8))}
                  </Text>
                </View>
                <View style={[styles.dot, dotStyle(status)]} />
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        <Legend color={colors.primary} label="All done" />
        <Legend color={colors.coral} label="Partial" />
        <Legend color={colors.borderStrong} label="Missed" />
        <Legend hollow label="Planned" />
        <Legend color={colors.sage} label="Active" />
      </View>
    </View>
  );
}

function dotStyle(s: DayStatus) {
  switch (s) {
    case 'done':
      return { backgroundColor: colors.primary };
    case 'partial':
      return { backgroundColor: colors.coral };
    case 'missed':
      return { backgroundColor: colors.borderStrong };
    case 'scheduled':
      return { borderWidth: 1.2, borderColor: colors.textTertiary };
    case 'logged':
      return { backgroundColor: colors.sage };
    default:
      return null;
  }
}

function Legend({ color, label, hollow }: { color?: string; label: string; hollow?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, hollow ? { borderWidth: 1.2, borderColor: colors.textTertiary } : { backgroundColor: color }]} />
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  week: { flexDirection: 'row' },
  head: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.textTertiary, fontWeight: '500', paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3, minHeight: 46 },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  num: { fontSize: 15, color: colors.text },
  numSel: { color: colors.onPrimary, fontWeight: '600' },
  numToday: { color: colors.primary, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space.lg, rowGap: space.xs, marginTop: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
