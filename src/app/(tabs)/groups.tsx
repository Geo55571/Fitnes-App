import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { exerciseIconColor, Icon } from '@/components/Icon';
import { Leaderboard } from '@/components/Leaderboard';
import { OverallRanking } from '@/components/OverallRanking';
import { WinterArcCard } from '@/components/winterArc/WinterArcCard';
import {
  AppHeader,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Notice,
  PersonBadge,
  Screen,
  ScreenTitle,
  SectionHeader,
  Sheet,
  Tag,
} from '@/components/ui';
import { formatDayShort, timeAgo } from '@/domain/dates';
import { describeEntry } from '@/domain/describe';
import { getExercise } from '@/domain/exercises';
import { activeChallenge, challengeState, groupLeaderboard, membersOf, SHARING_LABEL } from '@/domain/groups';
import { overallRatings } from '@/domain/rating';
import { useSelf } from '@/hooks/self';
import { useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { groupsApi, isSignedIn, syncLabel, syncNow, useSync } from '@/sync';
import { colors, space, type } from '@/theme';

export default function GroupsScreen() {
  const today = useToday();
  const prefs = useUnits();
  const me = useSelf();
  const { groups, people, sessions, peopleSessions, settings, challengeTotals } = useStore(
    useShallow((s) => ({
      groups: s.groups,
      people: s.people,
      sessions: s.sessions,
      peopleSessions: s.peopleSessions,
      settings: s.settings,
      challengeTotals: s.challengeTotals,
    })),
  );
  const syncState = useSync();
  const signedIn = !!syncState.userId;
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const [joining, setJoining] = useState(false);
  const join = async () => {
    setJoinError(null);
    if (!isSignedIn()) {
      return setJoinError('Create an account or log in first — it only takes a name and a password.');
    }
    setJoining(true);
    try {
      const g = await groupsApi.join(code);
      setJoinOpen(false);
      setCode('');
      router.push({ pathname: '/group/[id]', params: { id: g.id } });
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Could not join.');
    } finally {
      setJoining(false);
    }
  };

  const friends = people.filter((p) => p.source !== 'self');

  return (
    <Screen
      tab
      header={<AppHeader actions={<IconButton icon="plus" label="Create group" size={26} onPress={() => router.push('/group/new')} />} />}>
      <ScreenTitle title="Groups" />

      {!signedIn ? (
        <Pressable onPress={() => router.push('/account')} accessibilityRole="button">
          <Notice icon="account-group">
            Create an account (just a name and a password) to invite friends, compete in challenges and see the overall
            ranking. <Text style={styles.inlineLink}>Create account</Text>
          </Notice>
        </Pressable>
      ) : (
        <View style={styles.syncRow}>
          <Text style={[type.small, syncState.status === 'error' && styles.err]} numberOfLines={2}>
            {syncLabel(syncState)}
            {syncState.lastSyncAt && syncState.status === 'ready' ? ` ${timeAgo(syncState.lastSyncAt)}` : ''}
            {syncState.status === 'error' && syncState.error ? ` · ${syncState.error}` : ''}
          </Text>
          <IconButton icon="refresh" label="Sync now" size={20} color={colors.textSecondary} onPress={() => syncNow()} />
        </View>
      )}

      <WinterArcCard invite style={styles.block} />

      {groups.some((g) => g.challenges.length > 0) && (
        <OverallRanking rows={overallRatings(groups, people, me, sessions, peopleSessions, settings, challengeTotals, today)} style={styles.block} />
      )}

      {groups.length === 0 ? (
        <Card style={styles.block}>
          <EmptyState
            icon="account-group"
            title="No groups yet"
            body="Create a group, set a challenge with a metric and dates, and compare results."
            action={<Button label="Create group" icon="plus" compact onPress={() => router.push('/group/new')} style={styles.emptyBtn} />}
          />
        </Card>
      ) : (
        groups.map((g) => {
          const members = membersOf(g, people, me);
          const challenge = activeChallenge(g, today);
          const rows = challenge ? groupLeaderboard(g, challenge, members, sessions, peopleSessions, settings, challengeTotals) : [];
          const cx = challenge ? getExercise(challenge.exerciseId) : null;
          return (
            <Card key={g.id} padded={false} style={styles.block}>
              <Pressable
                onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })}
                style={({ pressed }) => [styles.groupHead, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${g.name}, ${members.length} members`}>
                <View style={styles.groupIcon}>
                  <Icon name="account-group" size={28} color="#fff" />
                </View>
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={styles.groupName} numberOfLines={1}>
                      {g.name}
                    </Text>
                    {g.demo && <Tag label="Sample" />}
                    {signedIn && !g.remote && !g.demo && <Tag label="This device" />}
                  </View>
                  <Text style={type.small}>
                    {members.length} {members.length === 1 ? 'member' : 'members'}
                  </Text>
                  <View style={styles.avatars}>
                    {members.slice(0, 6).map((p, i) => (
                      <View key={p.id} style={{ marginLeft: i ? -8 : 0 }}>
                        <PersonBadge name={p.name} color={p.color} size={34} ring />
                      </View>
                    ))}
                  </View>
                </View>
                <Icon name="chevron-right" size={22} color={colors.textTertiary} />
              </Pressable>
              <Divider />
              <View style={styles.challenge}>
                {challenge && cx ? (
                  <>
                    <View style={styles.chHead}>
                      <Text style={type.bodyStrong}>
                        {challengeState(challenge, today) === 'active' ? 'Current challenge' : 'Next challenge'}
                      </Text>
                      <Text style={type.caption}>
                        {challengeState(challenge, today) === 'active' ? `Ends ${formatDayShort(challenge.endDate)}` : `Starts ${formatDayShort(challenge.startDate)}`}
                      </Text>
                    </View>
                    <View style={styles.chCard}>
                      <View style={styles.chTitle}>
                        <Icon name={cx.icon} size={28} color={exerciseIconColor(cx.id)} />
                        <View style={styles.flex}>
                          <Text style={type.bodyStrong}>{challenge.title}</Text>
                          <Text style={type.small}>
                            Most {challenge.metric === 'distance' ? 'distance' : challenge.metric} · {cx.name.toLowerCase()}
                          </Text>
                        </View>
                      </View>
                      <Leaderboard rows={rows} metric={challenge.metric} prefs={prefs} groupId={g.id} limit={3} />
                    </View>
                  </>
                ) : (
                  <Pressable
                    onPress={() => router.push({ pathname: '/challenge/new', params: { group: g.id } })}
                    style={styles.noChallenge}
                    accessibilityRole="button">
                    <Text style={type.small}>No active challenge.</Text>
                    <Text style={styles.link}>Set a challenge</Text>
                  </Pressable>
                )}
              </View>
            </Card>
          );
        })
      )}

      <Button label="Join with invite code" variant="secondary" compact icon="account-group" onPress={() => setJoinOpen(true)} style={styles.joinBtn} />

      <Card padded={false} style={styles.block}>
        <SectionHeader title="Friends" style={styles.friendsHead} />
        {friends.length === 0 ? (
          <Text style={[type.small, styles.friendsEmpty]}>
            {signedIn
              ? 'Friends appear here once they join one of your groups with its invite code.'
              : 'Friends appear here after they join one of your groups. That needs group sync and an account.'}
          </Text>
        ) : (
          friends.map((p, i) => {
            const theirs = peopleSessions.filter((s) => s.personId === p.id).sort((a, b) => b.performedAt.localeCompare(a.performedAt));
            const latest = theirs[0];
            const e = latest?.entries[0];
            let subtitle = SHARING_LABEL[p.sharing];
            if (p.sharing === 'everything' && latest && e) {
              subtitle = `${getExercise(e.exerciseId).name} ${describeEntry(e, prefs)} · ${timeAgo(latest.performedAt)}`;
            }
            return (
              <View key={p.id}>
                {i > 0 && <Divider inset={72} />}
                <ListRow
                  leading={<PersonBadge name={p.name} color={p.color} size={44} />}
                  title={p.name}
                  subtitle={subtitle}
                  right={p.source === 'demo' ? <Tag label="Sample" /> : undefined}
                  onPress={() => router.push({ pathname: '/member/[id]', params: { id: p.id } })}
                />
              </View>
            );
          })
        )}
      </Card>

      <Sheet visible={joinOpen} onClose={() => { setJoinOpen(false); setJoinError(null); }} title="Join a group">
        <Field
          label="Invite code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="e.g. K7Q2MX"
          maxLength={8}
          error={joinError ?? undefined}
        />
        <Button label={joining ? 'Joining…' : 'Join'} onPress={join} disabled={code.trim().length < 6 || joining} style={styles.sheetBtn} />
        <Text style={[type.caption, styles.sheetNote]}>Ask a member for the 6-character code on their group page.</Text>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  block: { marginTop: space.lg, overflow: 'hidden' },
  pressed: { backgroundColor: colors.surfaceMuted },
  emptyBtn: { marginTop: space.md },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  groupIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  groupName: { fontSize: 21, fontWeight: '600', color: colors.text, letterSpacing: -0.3, flexShrink: 1 },
  avatars: { flexDirection: 'row', marginTop: space.sm },
  challenge: { padding: space.lg, paddingTop: space.md },
  chHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.md },
  chCard: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: space.sm, gap: space.sm },
  chTitle: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm },
  noChallenge: { gap: 4 },
  link: { fontSize: 15, fontWeight: '600', color: colors.primary },
  joinBtn: { marginTop: space.lg },
  friendsHead: { paddingHorizontal: space.lg, paddingTop: space.lg, marginBottom: space.xs },
  friendsEmpty: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  sheetBtn: { marginTop: space.lg },
  inlineLink: { color: colors.primary, fontWeight: '600' },
  err: { color: colors.danger },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: -space.sm },
  sheetNote: { marginTop: space.sm, marginBottom: space.md, textAlign: 'center' },
});
