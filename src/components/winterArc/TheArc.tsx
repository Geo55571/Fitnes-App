/**
 * THE ARC — the whole Winter Arc as one half-circle: 124 ticks, Oct 1 on the left to Feb 1 on the
 * right, each coloured by how that day went. Today's tick stands out; the centre shows where you are.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Text as SvgText } from 'react-native-svg';

import { diffDays } from '@/domain/dates';
import { WINTER_ARC, type ArcDayStatus, type ChallengeStatistics } from '@/domain/winterArc';
import { colors, radius, space, tabular } from '@/theme';

/** Tick colours on the deep green card. */
const TICK: Record<ArcDayStatus, string> = {
  perfect: '#FFFFFF',
  excused: colors.sage,
  partial: '#F3B9A8',
  failed: colors.coral,
  missed: 'rgba(255,255,255,0.28)',
  open: 'rgba(255,255,255,0.28)',
  future: 'rgba(255,255,255,0.12)',
  untracked: 'rgba(255,255,255,0.07)',
};

const MONTH_MARKS = [
  { day: '2026-11-01', label: 'NOV' },
  { day: '2026-12-01', label: 'DEC' },
  { day: '2027-01-01', label: 'JAN' },
];

export function TheArc({ stats, onPress }: { stats: ChallengeStatistics; onPress?: () => void }) {
  const [width, setWidth] = useState(0);
  const n = stats.totalDays;
  const r = Math.max(80, Math.min(width / 2 - 18, 150));
  const cx = width / 2;
  const cy = r + 16;
  const h = cy + 8;
  const todayIndex = stats.phase === 'active' ? stats.dayNumber - 1 : -1;
  const angle = (i: number) => Math.PI - (Math.PI * (i + 0.5)) / n;
  const pct = Math.round(stats.timeProgress * 100);

  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.kicker}>THE ARC</Text>
        <Text style={styles.range}>Oct 1 → Feb 1</Text>
      </View>

      <View style={{ height: h }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={h}>
            {stats.days.map((d, i) => {
              const a = angle(i);
              const isToday = i === todayIndex;
              const inner = isToday ? r - 26 : r - 16;
              const outer = isToday ? r + 6 : r;
              return (
                <Line
                  key={d.date}
                  x1={cx + inner * Math.cos(a)}
                  y1={cy - inner * Math.sin(a)}
                  x2={cx + outer * Math.cos(a)}
                  y2={cy - outer * Math.sin(a)}
                  stroke={isToday ? '#FFFFFF' : TICK[d.status]}
                  strokeWidth={isToday ? 3 : 2}
                  strokeLinecap="round"
                />
              );
            })}
            {MONTH_MARKS.map((m) => {
              const a = angle(diffDays(m.day, WINTER_ARC.start));
              return (
                <SvgText
                  key={m.label}
                  x={cx + (r - 30) * Math.cos(a)}
                  y={cy - (r - 30) * Math.sin(a) + 3}
                  fill="rgba(255,255,255,0.45)"
                  fontSize={9}
                  fontWeight="600"
                  textAnchor="middle">
                  {m.label}
                </SvgText>
              );
            })}
          </Svg>
        )}
        <View style={[styles.center, { top: cy - r * 0.62 }]} pointerEvents="none">
          {stats.phase === 'upcoming' ? (
            <>
              <Text style={[styles.big, tabular]}>{stats.daysToStart}</Text>
              <Text style={styles.sub}>days to go</Text>
            </>
          ) : (
            <>
              <Text style={styles.dayLabel}>{stats.phase === 'finished' ? 'Complete' : 'Day'}</Text>
              <Text style={[styles.big, tabular]}>
                {stats.dayNumber}
                <Text style={styles.of}> / {n}</Text>
              </Text>
              <Text style={[styles.sub, tabular]}>{pct}% complete</Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>

      <View style={styles.stats}>
        <Stat value={String(stats.perfectDays)} label="Perfect days" />
        <Stat value={String(stats.streaks.current)} label="Current streak" />
        <Stat value={String(stats.streaks.longest)} label="Longest streak" />
        <Stat value={stats.score.value === null ? '–' : String(stats.score.value)} label="Discipline" />
      </View>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tabular]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.lg, overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  kicker: { fontSize: 13, fontWeight: '700', letterSpacing: 2, color: colors.onPrimary },
  range: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dayLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 1.5, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' },
  big: { fontSize: 46, fontWeight: '700', color: colors.onPrimary, letterSpacing: -1.5, lineHeight: 52 },
  of: { fontSize: 20, fontWeight: '600', color: 'rgba(255,255,255,0.55)', letterSpacing: 0 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', marginTop: space.sm },
  barFill: { height: '100%', backgroundColor: colors.onPrimary, borderRadius: 2 },
  stats: {
    flexDirection: 'row',
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.onPrimary },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },
});
