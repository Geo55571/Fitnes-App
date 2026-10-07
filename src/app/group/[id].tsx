import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { goBack } from '@/components/nav';
import { confirmAction } from '@/components/confirm';
import { exerciseIconColor, Icon } from '@/components/Icon';
import { Leaderboard } from '@/components/Leaderboard';
import { showToast } from '@/components/toast';
import {
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
  SectionHeader,
  Sheet,
  StackHeader,
  Tag,
} from '@/components/ui';
import { formatMonthDay } from '@/domain/dates';
import { METRIC_LABEL, getExercise } from '@/domain/exercises';
import { challengeState, groupLeaderboard, membersOf, ME_ID, SHARING_LABEL } from '@/domain/groups';
import { useSelf } from '@/hooks/self';
import { useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { groupsApi, inviteLink, useSync } from '@/sync';
import { colors, space, type } from '@/theme';

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const prefs = useUnits();
  const me = useSelf();
  const s = useStore(
    useShallow((st) => ({
      group: st.groups.find((g) => g.id === id),
      people: st.people,
      sessions: st.sessions,
      peopleSessions: st.peopleSessions,
      settings: st.settings,
      challengeTotals: st.challengeTotals,
      renameGroup: st.renameGroup,
      deleteGroup: st.deleteGroup,
      deleteChallenge: st.deleteChallenge,
    })),
  );
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const signedIn = !!useSync((st) => st.userId);

  const group = s.group;
  if (!group) {
    return (
      <Screen header={<StackHeader title="Group" />}>
        <EmptyState icon="account-group" title="Group not found" />
      </Screen>
    );
  }

  const members = membersOf(group, s.people, me);
  const challenges = [...group.challenges].sort((a, b) => {
    const order = { active: 0, upcoming: 1, ended: 2 };
    return order[challengeState(a, today)] - order[challengeState(b, today)] || b.startDate.localeCompare(a.startDate);
  });

  const remote = !!group.remote;
  const canManage = !group.demo && (!remote || !!group.isOwner);

  /** Runs a server operation for synced groups (with a visible error), or the local one. */
  const act = async (onServer: () => Promise<unknown>, onDevice: () => void, done?: () => void) => {
    try {
      if (remote) await onServer();
      else onDevice();
      done?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    }
  };

  const invite = async () => {
    const link = inviteLink(group.inviteCode);
    const copy = async () => {
      await Clipboard.setStringAsync(link).catch(() => {});
      showToast('Invite link copied');
    };
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    try {
      if (Platform.OS !== 'web') await Share.share({ message: `Join my FORM group “${group.name}”: ${link}` });
      else if (nav?.share) await nav.share({ title: `Join ${group.name} on FORM`, text: `Join my FORM group “${group.name}”`, url: link });
      else await copy();
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') await copy();
    }
  };

  return (
    <Screen
      header={
        <StackHeader
          title={group.name}
          right={canManage ? <IconButton icon="pencil-outline" label="Rename group" onPress={() => { setName(group.name); setRenaming(true); }} /> : undefined}
        />
      }>
      {group.demo && (
        <View style={styles.gap}>
          <Notice icon="account-group">This is a sample group. Its members and their results are generated examples, not real people.</Notice>
        </View>
      )}

      <SectionHeader title="Challenges" right="New" onRightPress={() => router.push({ pathname: '/challenge/new', params: { group: group.id } })} />
      {challenges.length === 0 ? (
        <Card>
          <EmptyState
            icon="trophy-outline"
            title="No challenges"
            body="Pick an exercise, a metric and dates. Everyone’s logged activity in that window counts."
            action={<Button label="Set a challenge" compact onPress={() => router.push({ pathname: '/challenge/new', params: { group: group.id } })} style={styles.btn} />}
          />
        </Card>
      ) : (
        challenges.map((c) => {
          const ex = getExercise(c.exerciseId);
          const state = challengeState(c, today);
          return (
            <Card key={c.id} style={styles.challenge}>
              <View style={styles.chHead}>
                <Icon name={ex.icon} size={26} color={exerciseIconColor(ex.id)} />
                <View style={styles.flex}>
                  <Text style={type.bodyStrong}>{c.title}</Text>
                  <Text style={type.small}>
                    {METRIC_LABEL[c.metric]} · {ex.name} · {formatMonthDay(c.startDate)} – {formatMonthDay(c.endDate)}
                  </Text>
                </View>
                <Tag label={state === 'active' ? 'Live' : state === 'upcoming' ? 'Upcoming' : 'Ended'} tone={state === 'active' ? 'green' : 'neutral'} />
                <IconButton
                  icon="trash-can-outline"
                  label="Delete challenge"
                  size={19}
                  color={colors.textSecondary}
                  onPress={() =>
                    confirmAction('Delete challenge?', 'Logged activity is not affected.', 'Delete', () =>
                      act(() => groupsApi.deleteChallenge(c.id), () => s.deleteChallenge(group.id, c.id)),
                    )
                  }
                />
              </View>
              <Leaderboard
                rows={groupLeaderboard(group, c, members, s.sessions, s.peopleSessions, s.settings, s.challengeTotals)}
                metric={c.metric}
                prefs={prefs}
                groupId={group.id}
              />
            </Card>
          );
        })
      )}

      <SectionHeader title="Members" right={String(members.length)} style={styles.section} />
      <Card padded={false} style={styles.clip}>
        {members.map((p, i) => (
          <View key={p.id}>
            {i > 0 && <Divider inset={72} />}
            <ListRow
              leading={<PersonBadge name={p.name} color={p.color} size={42} />}
              title={p.id === ME_ID ? `${p.name} (you)` : p.name}
              subtitle={SHARING_LABEL[p.sharing]}
              right={p.source === 'demo' ? <Tag label="Sample" /> : undefined}
              onPress={() => router.push({ pathname: '/member/[id]', params: { id: p.id, group: group.id } })}
            />
          </View>
        ))}
      </Card>

      <SectionHeader title="Invite friends" style={styles.section} />
      {remote ? (
        <Card>
          <Text style={type.small}>Invite code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.code} selectable>
              {group.inviteCode}
            </Text>
            {group.isOwner && (
              <IconButton
                icon="refresh"
                label="New code"
                color={colors.textSecondary}
                onPress={() =>
                  confirmAction('New invite code?', 'The old code stops working. People already in the group stay.', 'Change', () =>
                    act(() => groupsApi.regenerateInvite(group.id), () => {}),
                  )
                }
              />
            )}
          </View>
          <Button label="Share invite link" icon="share-variant-outline" onPress={invite} />
          <Text style={[type.caption, styles.inviteNote]} selectable>
            {inviteLink(group.inviteCode)}
          </Text>
          <Text style={[type.caption, styles.inviteNote]}>Friends open the link, create an account with their name, and they’re in.</Text>
        </Card>
      ) : (
        <Notice icon="lock-outline">
          {group.demo
            ? 'Sample groups can’t be shared.'
            : signedIn
              ? 'This group lives on this device only. To invite friends, create a new group — groups created while logged in are shared.'
              : 'This group lives on this device only. Create an account (Settings → Account), then create a group to invite friends.'}
        </Notice>
      )}

      {canManage && (
        <Button
          label="Delete group"
          variant="danger"
          style={styles.section}
          onPress={() =>
            confirmAction(
              'Delete group?',
              remote ? 'The group and its challenges are deleted for everyone. Logged activity stays.' : 'Challenges in this group are removed. Your own logged activity stays.',
              'Delete',
              () => act(() => groupsApi.remove(group.id), () => s.deleteGroup(group.id), goBack),
            )
          }
        />
      )}
      {remote && !group.isOwner && (
        <Button
          label="Leave group"
          variant="danger"
          style={styles.section}
          onPress={() =>
            confirmAction('Leave group?', 'You can rejoin later with the invite code.', 'Leave', () =>
              act(() => groupsApi.leave(group.id), () => {}, goBack),
            )
          }
        />
      )}

      <Sheet visible={renaming} onClose={() => setRenaming(false)} title="Rename group">
        <Field value={name} onChangeText={setName} maxLength={40} autoFocus accessibilityLabel="Group name" />
        <Button
          label="Save"
          disabled={!name.trim()}
          style={styles.sheetBtn}
          onPress={() => {
            act(() => groupsApi.rename(group.id, name), () => s.renameGroup(group.id, name));
            setRenaming(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap: { marginBottom: space.lg },
  btn: { marginTop: space.md },
  challenge: { marginBottom: space.md, gap: space.md, backgroundColor: colors.surfaceMuted },
  chHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  section: { marginTop: space.xl },
  clip: { overflow: 'hidden' },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: space.sm },
  code: { fontSize: 28, fontWeight: '700', letterSpacing: 4, color: colors.text },
  inviteNote: { marginTop: space.sm },
  sheetBtn: { marginTop: space.lg, marginBottom: space.md },
});

