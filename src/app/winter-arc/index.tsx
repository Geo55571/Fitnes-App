import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { confirmAction } from '@/components/confirm';
import { Icon } from '@/components/Icon';
import { showToast } from '@/components/toast';
import { Button, Card, Divider, ListRow, Notice, Screen, Segmented, StackHeader } from '@/components/ui';
import { ArcGroup } from '@/components/winterArc/ArcGroup';
import { ArcChecklist } from '@/components/winterArc/Checklist';
import { TheArc } from '@/components/winterArc/TheArc';
import type { IconName } from '@/domain/exercises';
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
  const unchecked = stats.days.filter((d) => d.status === 'missed').length;
  // Start the list fresh whenever the saved day changes (here, in the details, or in Log).
  const checklistKey = `${today}-${day?.entry?.updatedAt ?? ''}-${stats.workouts.filter((w) => w.date === today).length}`;

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
            <Text style={[type.bodyStrong, tabular]}>{stats.streaks.current} day streak</Text>
          </View>
        )}
      </View>

      {day && (
        <Card>
          <Text style={[type.section, styles.cardTitle]}>Today</Text>
          <ArcChecklist key={checklistKey} date={today} stats={stats} today={today} />
        </Card>
      )}

      {unchecked > 0 && (
        <Pressable onPress={() => router.push('/winter-arc/calendar')} accessibilityRole="button" style={styles.block}>
          <Notice icon="calendar-alert">
            {unchecked} earlier {unchecked === 1 ? 'day has' : 'days have'} no check-in. <Text style={styles.link}>Fill them in</Text>
          </Notice>
        </Pressable>
      )}

      <View style={styles.block}>
        <ArcGroup stats={stats} today={today} />
      </View>

      <View style={styles.block}>
        <TheArc stats={stats} onPress={() => router.push('/winter-arc/calendar')} />
      </View>

      <View style={styles.links}>
        <LinkButton icon="calendar-month-outline" label="Calendar" onPress={() => router.push('/winter-arc/calendar')} />
        <LinkButton icon="chart-box-outline" label="Statistics" onPress={() => router.push('/winter-arc/stats')} />
        <LinkButton icon="file-document-outline" label="Rules" onPress={() => router.push('/winter-arc/rules')} />
      </View>

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

function LinkButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={colors.text} />
      <Text style={styles.linkLabel}>{label}</Text>
    </Pressable>
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
      <Text style={[type.caption, styles.note]}>You tick off each day by hand. Your groups see only whether you checked in, never which rules.</Text>

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
  pressed: { backgroundColor: colors.surfaceMuted },
  clip: { overflow: 'hidden' },
  titleBlock: { marginTop: space.xs, marginBottom: space.lg, gap: 4 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: colors.textSecondary },
  lead: { ...type.body, color: colors.textSecondary },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  block: { marginTop: space.lg },
  link: { color: colors.primary, fontWeight: '600' },
  cardTitle: { marginBottom: space.md },
  links: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  linkButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  linkLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  leave: { alignSelf: 'center', marginTop: space.xl, paddingVertical: space.sm },
  leaveText: { fontSize: 13, color: colors.textTertiary, fontWeight: '500' },
  note: { marginTop: space.sm },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  rulesBtn: { marginTop: space.sm },
});
