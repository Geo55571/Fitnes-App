import { StyleSheet, Text, View } from 'react-native';

import { Card, Divider, Notice, ProgressBar, Screen, StackHeader, Tag } from '@/components/ui';
import { COMPLIANCE_POINTS, MISS_PENALTY_MAX, RECENT_DAYS, RULE_LABEL, STREAK_POINTS_MAX } from '@/domain/winterArc';
import { useWinterArc } from '@/hooks/winterArc';
import { colors, space, tabular, type } from '@/theme';

/** Why the Discipline Score is what it is — every number that goes into it. */
export default function ArcScoreScreen() {
  const { stats } = useWinterArc();
  const s = stats.score;
  const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);
  const fmt = (x: number) => (Math.round(x * 10) / 10).toString();

  return (
    <Screen header={<StackHeader title="Discipline Score" />}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>DISCIPLINE SCORE</Text>
        <Text style={[styles.value, tabular]}>{s.value ?? '–'}</Text>
        <Tag label={s.label} tone={s.value !== null && s.value >= 75 ? 'green' : s.value !== null && s.value < 40 ? 'coral' : 'neutral'} />
        <Text style={[type.small, styles.streak]}>Current streak: {stats.streaks.current} {stats.streaks.current === 1 ? 'day' : 'days'}</Text>
      </View>

      {s.value === null ? (
        <Notice icon="information-outline">The score starts once the first day of your Winter Arc is checked in.</Notice>
      ) : (
        <>
          <Card>
            {s.components.map((c, i) => (
              <View key={c.key}>
                {i > 0 && <Divider />}
                <View style={styles.component}>
                  <View style={styles.compHead}>
                    <Text style={[type.body, styles.flex]}>{RULE_LABEL[c.key]}</Text>
                    <Text style={[type.bodyStrong, tabular]}>{pct(c.rate)}</Text>
                  </View>
                  <ProgressBar fraction={c.rate ?? 0} done={c.rate === 1} />
                  <Text style={type.caption}>
                    {c.rate === null
                      ? 'Nothing due yet — left out for now'
                      : `${fmt(c.earned)} of ${c.due} ${c.key === 'strength' || c.key === 'endurance' ? (c.due === 1 ? 'week' : 'weeks') : c.due === 1 ? 'day' : 'days'} · weight ${c.weight}`}
                  </Text>
                </View>
              </View>
            ))}
          </Card>

          <Card style={styles.block}>
            <Line label={`Compliance ${pct(s.compliance)} × ${COMPLIANCE_POINTS}`} value={fmt(s.compliancePoints)} />
            <Line label={`Streak bonus (1 per day, max ${STREAK_POINTS_MAX})`} value={`+${s.streakPoints}`} />
            <Line label={`Missed or broken in the last ${RECENT_DAYS} days (max ${MISS_PENALTY_MAX})`} value={s.penalty ? `−${s.penalty}` : '0'} />
            <Divider />
            <Line label="Discipline Score" value={String(s.value)} strong />
          </Card>
        </>
      )}

      <Card style={styles.block}>
        <Text style={type.bodyStrong}>How it works</Text>
        <Text style={[type.small, styles.p]}>
          Each rule gets a rate: the share of days (or weeks) it was met so far. Reading earns partial credit — 15 of 30 minutes counts half. A
          week’s workouts count once the week is over or the minimum is reached.
        </Text>
        <Text style={[type.small, styles.p]}>
          The rates are weighted — nutrition 25, reading 20, discipline 20, strength 20, endurance 15 — and make up 90 points. Your streak adds up to
          10; recent misses take up to 10 away.
        </Text>
        <Text style={[type.small, styles.p]}>Approved exceptions are left out entirely. Today only counts for what you’ve already entered.</Text>
      </Card>
    </Screen>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[strong ? type.bodyStrong : type.body, styles.flex]}>{label}</Text>
      <Text style={[strong ? styles.total : type.bodyStrong, tabular]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { alignItems: 'center', gap: space.xs, marginTop: space.md, marginBottom: space.xl },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: colors.textSecondary },
  value: { fontSize: 72, fontWeight: '700', color: colors.text, letterSpacing: -3, lineHeight: 80 },
  streak: { marginTop: space.xs },
  component: { paddingVertical: space.md, gap: 6 },
  compHead: { flexDirection: 'row', alignItems: 'baseline' },
  block: { marginTop: space.lg },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8 },
  total: { fontSize: 20, fontWeight: '700', color: colors.text },
  p: { marginTop: space.sm, lineHeight: 19 },
});
