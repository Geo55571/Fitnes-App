/**
 * Who in your groups is doing the Winter Arc, and whether they've checked in today.
 * Group-mates only see completion and a count, never which rules (see arcSharedDays).
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { arcMemberSummary, type ChallengeStatistics } from '@/domain/winterArc';
import { useStore } from '@/store/store';
import { useSync } from '@/sync';
import { colors, space, tabular, type } from '@/theme';

import { Icon } from '../Icon';
import { Card, Divider, PersonBadge, Tag } from '../ui';

export function ArcGroup({ stats, today }: { stats: ChallengeStatistics; today: string }) {
  const { people, arcShared, name, color, sharing } = useStore(
    useShallow((s) => ({ people: s.people, arcShared: s.arcShared, name: s.profile.name, color: s.avatar.badgeColor, sharing: s.settings.sharing })),
  );
  const signedIn = !!useSync((s) => s.userId);

  const doneToday = stats.today ? Object.values(stats.today.outcomes).filter((o) => o === 'done' || o === 'exception').length : 0;
  const rows = [
    {
      id: 'me',
      name: name || 'You',
      color,
      you: true,
      demo: false,
      today: stats.today?.entry?.checkedInAt ? { done: doneToday, complete: stats.today.perfect || stats.today.allExcepted } : null,
      streak: stats.streaks.current,
      perfectDays: stats.perfectDays,
    },
    ...people
      .filter((p) => arcShared[p.id]?.length)
      .map((p) => {
        const s = arcMemberSummary(arcShared[p.id], today);
        return { id: p.id, name: p.name, color: p.color, you: false, demo: p.source === 'demo', today: s.today, streak: s.streak, perfectDays: s.perfectDays };
      })
      .sort((a, b) => Number(!!b.today?.complete) - Number(!!a.today?.complete) || b.streak - a.streak),
  ];

  return (
    <Card padded={false} style={styles.card}>
      <View style={styles.head}>
        <Text style={type.section}>Your group</Text>
        <Text style={type.caption}>Checked in today</Text>
      </View>
      {rows.map((r, i) => (
        <View key={r.id}>
          {i > 0 && <Divider inset={64} />}
          <View style={styles.row}>
            <PersonBadge name={r.name} color={r.color} size={36} />
            <View style={styles.body}>
              <View style={styles.nameRow}>
                <Text style={type.bodyStrong} numberOfLines={1}>
                  {r.you ? `${r.name} (you)` : r.name}
                </Text>
                {r.demo && <Tag label="Sample" />}
              </View>
              <Text style={[type.caption, tabular]}>
                {r.streak} day streak · {r.perfectDays} perfect {r.perfectDays === 1 ? 'day' : 'days'}
              </Text>
            </View>
            {r.today?.complete ? (
              <Icon name="check-circle" size={26} color={colors.primary} />
            ) : r.today ? (
              <Text style={[styles.partial, tabular]}>{r.today.done}/3</Text>
            ) : (
              <Text style={styles.waiting}>Not yet</Text>
            )}
          </View>
        </View>
      ))}
      {rows.length === 1 && (
        <Pressable onPress={() => router.push(signedIn ? '/groups' : '/account')} accessibilityRole="button" style={styles.foot}>
          <Text style={type.small}>
            {signedIn
              ? 'Friends in your groups who join the Winter Arc show up here.'
              : 'Log in and join a group so your friends see your check-ins. '}
            {!signedIn && <Text style={styles.link}>Log in</Text>}
          </Text>
        </Pressable>
      )}
      {sharing === 'private' && (
        <View style={styles.foot}>
          <Text style={type.caption}>Your privacy is set to Private, so your group doesn’t see your check-ins.</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10 },
  body: { flex: 1, minWidth: 0, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  partial: { fontSize: 15, fontWeight: '600', color: colors.coral },
  waiting: { fontSize: 13, color: colors.textTertiary },
  foot: { paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.xs },
  link: { color: colors.primary, fontWeight: '600' },
});
