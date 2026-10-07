import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { confirmAction } from '@/components/confirm';
import { Icon } from '@/components/Icon';
import { showToast } from '@/components/toast';
import { Button, Card, Divider, ListRow, Notice, Screen, Segmented, StackHeader, Tag } from '@/components/ui';
import { StatusRow } from '@/components/winterArc/parts';
import { TheArc } from '@/components/winterArc/TheArc';
import { formatDayShort, formatMonthDay } from '@/domain/dates';
import { WINTER_ARC } from '@/domain/winterArc';
import { useWinterArc } from '@/hooks/winterArc';
import { useStore } from '@/store/store';
import { colors, radius, space, tabular, type } from '@/theme';

export default function WinterArcScreen() {
  const { joined } = useWinterArc();
  return (
    <Screen header={<StackHeader title="Winter Arc" />}>
      {joined ? <Dashboard /> : <Join />}
    </Screen>
  );
}

function Dashboard() {
  const { stats, today } = useWinterArc();
  const leave = useStore((s) => s.leaveWinterArc);
  const day = stats.today;
  const week = stats.thisWeek;
  const score = stats.score;
  const reading = day?.entry?.reading?.minutes ?? 0;
  const unchecked = stats.days.filter((d) => d.status === 'missed').length;

  return (
    <>
      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>WINTER ARC 2026/27</Text>
        <Text style={type.title} accessibilityRole="header">
          {stats.phase === 'upcoming' ? `Starts in ${stats.daysToStart} ${stats.daysToStart === 1 ? 'day' : 'days'}` : stats.phase === 'finished' ? 'Complete' : `Day ${stats.dayNumber} of ${stats.totalDays}`}
        </Text>
        {stats.phase !== 'upcoming' && (
          <View style={styles.streak}>
            <Icon name="fire" size={18} color={stats.streaks.current ? colors.coral : colors.textTertiary} />
            <Text style={[type.bodyStrong, tabular]}>
              {stats.streaks.current} day streak
            </Text>
          </View>
        )}
      </View>

      {unchecked > 0 && (
        <Pressable onPress={() => router.push('/winter-arc/calendar')} accessibilityRole="button" style={styles.missing}>
          <Notice icon="calendar-alert">
            {unchecked} earlier {unchecked === 1 ? 'day has' : 'days have'} no check-in and count as missed. <Text style={styles.link}>Fill them in</Text>
          </Notice>
        </Pressable>
      )}

      <Pressable
        onPress={() => router.push('/winter-arc/score')}
        accessibilityRole="button"
        accessibilityLabel={`Discipline Score ${score.value ?? 'not started'}, ${score.label}. Shows how it is calculated.`}
        style={({ pressed }) => [styles.score, pressed && styles.pressed]}>
        <View style={styles.flex}>
          <Text style={styles.scoreKicker}>DISCIPLINE SCORE</Text>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreValue, tabular]}>{score.value ?? '–'}</Text>
            <Tag label={score.label} tone={score.value !== null && score.value >= 75 ? 'green' : score.value !== null && score.value < 40 ? 'coral' : 'neutral'} />
          </View>
        </View>
        <Text style={type.small}>Why?</Text>
        <Icon name="chevron-right" size={20} color={colors.textTertiary} />
      </Pressable>

      {day && (
        <Card style={styles.block}>
          <View style={styles.cardHead}>
            <Text style={styles.cardKicker}>TODAY</Text>
            <Text style={type.caption}>{formatDayShort(today)}</Text>
          </View>
          <StatusRow label="Nutrition" outcome={day.outcomes.nutrition} />
          <Divider />
          <StatusRow label="Reading" value={`${reading}/${WINTER_ARC.readingMinutes}`} outcome={day.outcomes.reading} />
          <Divider />
          <StatusRow label="Discipline" outcome={day.outcomes.discipline} />
          <Button
            label={day.entry?.checkedInAt ? 'Edit check-in' : 'Check in'}
            icon={day.entry?.checkedInAt ? 'pencil-outline' : 'check-circle-outline'}
            variant={day.entry?.checkedInAt ? 'secondary' : 'primary'}
            onPress={() => router.push({ pathname: '/winter-arc/day/[date]', params: { date: today } })}
            style={styles.cardBtn}
          />
        </Card>
      )}

      {week && (
        <Card padded={false} style={styles.block}>
          <Pressable
            onPress={() => router.push({ pathname: '/winter-arc/week', params: { start: week.start } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.weekPad, pressed && styles.pressed]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardKicker}>THIS WEEK</Text>
              <Text style={type.caption}>
                Week {week.index} · {formatMonthDay(week.from)} – {formatMonthDay(week.to)}
              </Text>
            </View>
            {week.weeklyApplies ? (
              <>
                <StatusRow label="Strength" value={`${week.strength.count}/${week.strength.min}`} outcome={week.strength.met ? 'met' : week.strength.excepted ? 'exception' : 'open'} />
                <Divider />
                <StatusRow label="Endurance" value={`${week.endurance.count}/${week.endurance.min}`} outcome={week.endurance.met ? 'met' : week.endurance.excepted ? 'exception' : 'open'} />
              </>
            ) : (
              <Text style={type.small}>Weekly minimums don’t apply this week — it has only {week.trackedDays} tracked challenge {week.trackedDays === 1 ? 'day' : 'days'}.</Text>
            )}
          </Pressable>
        </Card>
      )}

      <View style={styles.block}>
        <TheArc stats={stats} onPress={() => router.push('/winter-arc/calendar')} />
      </View>

      <Card padded={false} style={[styles.block, styles.clip]}>
        {stats.phase !== 'upcoming' && (
          <>
            <ListRow icon="weight-lifter" title="Add workout" subtitle="Strength or endurance" onPress={() => router.push('/winter-arc/workout')} />
            <Divider inset={56} />
          </>
        )}
        <ListRow icon="calendar-month-outline" title="Calendar" subtitle="Every day of the arc" onPress={() => router.push('/winter-arc/calendar')} />
        <Divider inset={56} />
        <ListRow icon="chart-box-outline" title="Statistics" subtitle="Streaks, weeks, exceptions and breaks" onPress={() => router.push('/winter-arc/stats')} />
        <Divider inset={56} />
        <ListRow icon="file-document-outline" title="Rules" onPress={() => router.push('/winter-arc/rules')} />
      </Card>

      <Pressable
        onPress={() =>
          confirmAction('Leave Winter Arc?', 'It disappears from Today. Your check-ins stay saved on this device, and come back if you join again.', 'Leave', () => {
            leave();
            showToast('You left the Winter Arc');
          })
        }
        style={styles.leave}
        accessibilityRole="button"
        hitSlop={8}>
        <Text style={styles.leaveText}>Leave challenge</Text>
      </Pressable>
    </>
  );
}

const RULES = [
  { icon: 'food-apple-outline', title: 'Healthy nutrition', body: 'No sweets, chips or added-sugar food and drinks.' },
  { icon: 'weight-lifter', title: 'Strength', body: '2–4 workouts every calendar week.' },
  { icon: 'run', title: 'Endurance', body: '1–2 runs or rides every calendar week.' },
  { icon: 'book-open-variant', title: 'Reading', body: '30 minutes of a printed book, every day.' },
  { icon: 'shield-check-outline', title: 'Discipline', body: 'Your personal rule, kept every day.' },
] as const;

function Join() {
  const { today, stats } = useWinterArc();
  const join = useStore((s) => s.joinWinterArc);
  const started = stats.phase === 'active' && today > WINTER_ARC.start;
  const [from, setFrom] = useState<'start' | 'today'>('start');

  return (
    <>
      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>PERSONAL CHALLENGE</Text>
        <Text style={type.title} accessibilityRole="header">
          Winter Arc 2026/27
        </Text>
        <Text style={styles.lead}>
          Oct 1, 2026 – Feb 1, 2027 · {stats.totalDays} days.{' '}
          {stats.phase === 'upcoming' ? `Starts in ${stats.daysToStart} days.` : stats.phase === 'finished' ? 'Finished.' : `Day ${stats.dayNumber} today.`}
        </Text>
      </View>

      <Card padded={false} style={styles.clip}>
        {RULES.map((r, i) => (
          <View key={r.title}>
            {i > 0 && <Divider inset={56} />}
            <ListRow icon={r.icon} iconColor={colors.primary} title={r.title} subtitle={r.body} />
          </View>
        ))}
      </Card>
      <Text style={[type.caption, styles.note]}>Everything is entered by hand and stays on this device. Nothing here is shared with your groups.</Text>

      {started && (
        <View style={styles.block}>
          <Text style={styles.label}>Count from</Text>
          <Segmented
            value={from}
            onChange={setFrom}
            options={[
              { value: 'start', label: 'Oct 1 (fill in past days)' },
              { value: 'today', label: 'Today' },
            ]}
          />
        </View>
      )}
      <Button
        label="Join the Winter Arc"
        icon="snowflake"
        disabled={stats.phase === 'finished'}
        style={styles.block}
        onPress={() => {
          join(started && from === 'today' ? today : WINTER_ARC.start);
          showToast('Welcome to the Winter Arc');
        }}
      />
      <Button label="Read the rules" variant="ghost" compact onPress={() => router.push('/winter-arc/rules')} style={styles.rulesBtn} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: colors.surfaceMuted },
  clip: { overflow: 'hidden' },
  titleBlock: { marginTop: space.xs, marginBottom: space.lg, gap: 4 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: colors.textSecondary },
  lead: { ...type.body, color: colors.textSecondary },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  scoreKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.textSecondary },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  scoreValue: { fontSize: 44, fontWeight: '700', color: colors.text, letterSpacing: -1.5 },
  block: { marginTop: space.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  cardKicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.textSecondary },
  cardBtn: { marginTop: space.md },
  weekPad: { padding: space.lg },
  missing: { marginBottom: space.lg },
  link: { color: colors.primary, fontWeight: '600' },
  leave: { alignSelf: 'center', marginTop: space.xl, paddingVertical: space.sm },
  leaveText: { fontSize: 13, color: colors.textTertiary, fontWeight: '500' },
  note: { marginTop: space.sm },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  rulesBtn: { marginTop: space.sm },
});
