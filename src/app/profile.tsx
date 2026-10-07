import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { exerciseIconColor, Icon } from '@/components/Icon';
import { Card, Divider, ListRow, PersonBadge, Screen, SectionHeader, StackHeader } from '@/components/ui';
import { formatMonthYear } from '@/domain/dates';
import { SHARING_LABEL } from '@/domain/groups';
import { getExercise } from '@/domain/exercises';
import { activeDays, currentStreak, entryValue } from '@/domain/metrics';
import { formatDistance, formatDurationWords } from '@/domain/units';
import { useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { colors, space, tabular, type } from '@/theme';

export default function ProfileScreen() {
  const today = useToday();
  const prefs = useUnits();
  const { profile, avatar, sessions, settings, goals } = useStore(
    useShallow((s) => ({ profile: s.profile, avatar: s.avatar, sessions: s.sessions, settings: s.settings, goals: s.goals })),
  );

  const lifetime = useMemo(() => {
    const sum = (id: string, m: 'reps' | 'distance' | 'duration') =>
      sessions.reduce((acc, s) => acc + s.entries.filter((e) => e.exerciseId === id).reduce((a, e) => a + entryValue(e, m), 0), 0);
    return [
      { id: 'pushups', value: `${sum('pushups', 'reps').toLocaleString('en-US')} reps` },
      { id: 'running', value: formatDistance(sum('running', 'distance'), prefs.distanceUnit) },
      { id: 'cycling', value: formatDistance(sum('cycling', 'distance'), prefs.distanceUnit) },
      { id: 'plank', value: formatDurationWords(sum('plank', 'duration')) },
    ];
  }, [sessions, prefs]);

  const days = activeDays(sessions).size;
  const streak = currentStreak(sessions, today);
  const activeGoals = goals.filter((g) => !g.endDate || g.endDate >= today).length;

  return (
    <Screen header={<StackHeader title="Profile" />}>
      <View style={styles.head}>
        <PersonBadge name={profile.name} color={avatar.badgeColor} size={72} />
        <View style={styles.flex}>
          <Text style={styles.name}>{profile.name || 'You'}</Text>
          <Text style={type.small}>Since {formatMonthYear(profile.createdAt.slice(0, 10))}</Text>
          <Text style={type.small}>{SHARING_LABEL[settings.sharing]}</Text>
        </View>
      </View>

      <Card style={styles.stats}>
        <Stat label="Sessions" value={String(sessions.length)} />
        <View style={styles.vr} />
        <Stat label="Active days" value={String(days)} />
        <View style={styles.vr} />
        <Stat label="Streak" value={String(streak)} />
        <View style={styles.vr} />
        <Stat label="Goals" value={String(activeGoals)} />
      </Card>

      <SectionHeader title="Lifetime" style={styles.section} />
      <Card padded={false} style={styles.clip}>
        {lifetime.map((l, i) => {
          const ex = getExercise(l.id);
          return (
            <View key={l.id}>
              {i > 0 && <Divider inset={56} />}
              <View style={styles.row}>
                <Icon name={ex.icon} size={22} color={exerciseIconColor(ex.id)} />
                <Text style={[type.body, styles.flex]}>{ex.name}</Text>
                <Text style={[type.bodyStrong, tabular]}>{l.value}</Text>
              </View>
            </View>
          );
        })}
      </Card>

      <Card padded={false} style={[styles.clip, styles.section]}>
        <ListRow icon="calendar-blank-outline" title="My activity" subtitle="Today, yesterday and last week" onPress={() => router.push({ pathname: '/member/[id]', params: { id: 'me' } })} />
        <Divider inset={56} />
        <ListRow icon="tshirt-crew-outline" title="Customize avatar" onPress={() => router.push('/avatar')} />
        <Divider inset={56} />
        <ListRow icon="cog-outline" title="Settings" onPress={() => router.push('/settings')} />
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tabular]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.sm, marginBottom: space.xl },
  name: { fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  vr: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  section: { marginTop: space.xl },
  clip: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 13 },
});
