import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Card, Screen, StackHeader } from '@/components/ui';
import type { IconName } from '@/domain/exercises';
import { colors, space, tabular, type } from '@/theme';

const RULES: { n: string; icon: IconName; title: string; rule: string; detail: string }[] = [
  {
    n: '01',
    icon: 'food-apple-outline',
    title: 'Healthy nutrition',
    rule: 'No sweets, chips or similar processed snacks. No food or drinks high in added sugar.',
    detail: 'Natural sugar, like in fruit, is fine. Unsure? Agree with the others before eating it.',
  },
  {
    n: '02',
    icon: 'weight-lifter',
    title: 'Strength',
    rule: '2–4 strength workouts every calendar week, Monday to Sunday.',
    detail: 'Place, type and length are up to you — it has to genuinely train strength.',
  },
  {
    n: '03',
    icon: 'shield-check-outline',
    title: 'Discipline',
    rule: 'Your personal discipline rule, kept for the whole challenge.',
    detail: 'Private. It’s never shared with your groups.',
  },
  {
    n: '04',
    icon: 'run',
    title: 'Endurance',
    rule: '1–2 endurance sessions every calendar week — running, jogging or cycling.',
    detail: 'No minimum time, distance or speed, but it must be a workout of its own. Everyday walking doesn’t count.',
  },
  {
    n: '05',
    icon: 'book-open-variant',
    title: 'Reading',
    rule: '30 minutes of a printed book, every day.',
    detail: 'Any book, any genre. Messages, social media, articles and other screen text don’t count.',
  },
];

export default function ArcRulesScreen() {
  return (
    <Screen header={<StackHeader title="Rules" />}>
      <View style={styles.head}>
        <Text style={styles.kicker}>OCT 1, 2026 – FEB 1, 2027</Text>
        <Text style={type.title} accessibilityRole="header">
          Five rules. One season.
        </Text>
      </View>

      {RULES.map((r) => (
        <Card key={r.n} style={styles.card}>
          <View style={styles.ruleHead}>
            <Text style={[styles.num, tabular]}>{r.n}</Text>
            <Text style={[type.section, styles.flex]}>{r.title}</Text>
            <Icon name={r.icon} size={22} color={colors.primary} />
          </View>
          <Text style={type.body}>{r.rule}</Text>
          <Text style={[type.small, styles.detail]}>{r.detail}</Text>
        </Card>
      ))}

      <Card style={[styles.card, styles.muted]}>
        <Text style={type.bodyStrong}>Approved exceptions</Text>
        <Text style={[type.small, styles.detail]}>
          A rule can be suspended only if both other participants agree beforehand. Give the reason openly; they may ask for reasonable proof. Mark
          it as an exception — it’s kept apart from completed days and rule breaks, and never lowers your score.
        </Text>
      </Card>

      <Card style={[styles.card, styles.muted]}>
        <Text style={type.bodyStrong}>When a rule is broken</Text>
        <Text style={[type.small, styles.detail]}>
          You stay in the challenge. The other two decide on a proportionate sporting or mental consequence. Mark the rule as broken and, if you like,
          note what happened — it’s simply recorded.
        </Text>
      </Card>

      <Card style={[styles.card, styles.muted]}>
        <Text style={type.bodyStrong}>How FORM counts</Text>
        <Text style={[type.small, styles.detail]}>
          A perfect day completes every daily rule (exceptions aside). A perfect week adds 2 strength workouts and 1 endurance session. One workout of
          each kind counts per day. Workouts you log anywhere in FORM count too: strength sessions, runs and rides. Weekly minimums apply to weeks with
          at least 4 challenge days, so Feb 1 — a lone Monday — only needs the daily rules.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { marginTop: space.xs, marginBottom: space.lg, gap: 4 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: colors.textSecondary },
  card: { marginBottom: space.md, gap: space.xs },
  muted: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  num: { fontSize: 13, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5 },
  detail: { lineHeight: 19 },
});
