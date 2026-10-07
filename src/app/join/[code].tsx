import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { showToast } from '@/components/toast';
import { Button, Card, Screen, StackHeader } from '@/components/ui';
import { groupsApi, setPendingInvite, useSync } from '@/sync';
import { colors, space, type } from '@/theme';

/**
 * Invite links: https://…/join/ABC234. Logged in, it joins the group at once; otherwise the code
 * is kept while you create an account (or log in), then you join automatically.
 */
export default function JoinScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = String(raw ?? '').trim().toUpperCase();
  const userId = useSync((s) => s.userId);
  const restored = useSync((s) => s.restored);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (!restored || !code) return;
    if (!userId) {
      setPendingInvite(code);
      return;
    }
    if (tried.current) return;
    tried.current = true;
    setPendingInvite(null);
    groupsApi
      .join(code)
      .then((g) => {
        showToast(`You joined ${g.name}`);
        router.replace({ pathname: '/group/[id]', params: { id: g.id } });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t join.'));
  }, [restored, userId, code]);

  return (
    <Screen header={<StackHeader title="Join a group" />}>
      <Card style={styles.card}>
        <Icon name="account-group" size={44} color={colors.primary} />
        <Text style={type.title}>You’re invited</Text>
        <Text style={[type.body, styles.center]}>
          Invite code <Text style={styles.code}>{code}</Text>
        </Text>
        {error ? (
          <>
            <Text style={[type.body, styles.err]}>{error}</Text>
            <Button label="Go to Groups" variant="secondary" onPress={() => router.replace('/groups')} />
          </>
        ) : userId ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={type.body}>Joining…</Text>
          </View>
        ) : (
          <>
            <Text style={[type.small, styles.center]}>
              Create an account with just a name and a password — or log in — and you’ll join the group right away.
            </Text>
            <Button label="Create account or log in" icon="account-plus-outline" onPress={() => router.push('/account')} style={styles.btn} />
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, marginTop: space.lg },
  center: { textAlign: 'center' },
  code: { fontWeight: '700', letterSpacing: 2, color: colors.text },
  err: { color: colors.danger, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  btn: { alignSelf: 'stretch' },
});
