import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { confirmAction } from '@/components/confirm';
import { showToast } from '@/components/toast';
import { Button, Card, Field, Notice, Screen, Segmented, StackHeader } from '@/components/ui';
import { timeAgo } from '@/domain/dates';
import { SHARING_LABEL } from '@/domain/groups';
import { useStore } from '@/store/store';
import { deleteAccount, signIn, signOut, signUp, syncLabel, syncNow, useSync } from '@/sync';
import { colors, radius, space, type } from '@/theme';

/** Accounts are just a name and a password: no email, nothing to confirm. */
export default function AccountScreen() {
  const sync = useSync();
  const sharing = useStore((s) => s.settings.sharing);
  const profileName = useStore((s) => s.profile.name);
  const onboarded = useStore((s) => s.profile.onboarded);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [name, setName] = useState(profileName);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Enter your name (at least 2 characters).');
    if (password.length < 6) return setError('Use at least 6 characters for the password.');
    setBusy(true);
    try {
      if (mode === 'up') {
        await signUp(name, password, remember);
        showToast(`Welcome, ${name.trim()}!`);
      } else {
        await signIn(name, password, remember);
        showToast('Logged in');
      }
      setPassword('');
      // Came straight from an invite link: the account name is enough to start.
      if (!onboarded) completeOnboarding({ name: name.trim(), distanceUnit: 'km', weightUnit: 'kg' });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (sync.userId) {
    return (
      <Screen header={<StackHeader title="Account" />}>
        <Card>
          <Text style={type.small}>Logged in as</Text>
          <Text style={[type.title, styles.name]}>{sync.name ?? 'your account'}</Text>
          <Text style={[type.small, styles.status, sync.status === 'error' && styles.err]}>
            {syncLabel(sync)}
            {sync.lastSyncAt && sync.status !== 'error' ? ` · ${timeAgo(sync.lastSyncAt)}` : ''}
            {sync.status === 'error' && sync.error ? `: ${sync.error}` : ''}
          </Text>
          <Button label="Sync now" variant="secondary" compact onPress={() => syncNow()} disabled={sync.status === 'syncing'} style={styles.btn} />
        </Card>
        <View style={styles.section}>
          <Notice icon="shield-lock-outline">
            Group-mates see: {SHARING_LABEL[sharing].toLowerCase()}.{' '}
            <Text style={styles.link} onPress={() => router.push('/settings')}>
              Change in Privacy
            </Text>
          </Notice>
        </View>
        <Button
          label="Log out"
          variant="secondary"
          icon="logout"
          style={styles.section}
          onPress={() =>
            confirmAction('Log out?', 'Shared groups disappear from this device until you log in again. Your own workouts stay.', 'Log out', () => signOut())
          }
        />
        <Button
          label="Delete account"
          variant="danger"
          compact
          style={styles.section}
          onPress={() =>
            confirmAction(
              'Delete your account?',
              'Your name is freed, you leave all groups, and everything you shared is removed from the server. Workouts on this device stay.',
              'Delete',
              () =>
                deleteAccount()
                  .then(() => showToast('Account deleted'))
                  .catch((e) => showToast(e instanceof Error ? e.message : 'Couldn’t delete the account.')),
            )
          }
        />
      </Screen>
    );
  }

  return (
    <Screen header={<StackHeader title="Account" />}>
      <Text style={[type.body, styles.lead]}>
        Join friends’ groups, compete in challenges and climb the overall ranking. All you need is a name and a password —
        no email.
      </Text>
      {sync.error ? <Text style={[styles.error, styles.topError]}>{sync.error}</Text> : null}
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: 'up', label: 'Create account' },
          { value: 'in', label: 'Log in' },
        ]}
      />
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete={mode === 'up' ? 'username-new' : 'username'}
        maxLength={24}
        hint={mode === 'up' ? 'Friends see this name. It’s also what you log in with.' : undefined}
        style={styles.field}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
        onSubmitEditing={submit}
        hint={mode === 'up' ? 'At least 6 characters.' : undefined}
        style={styles.field}
      />
      <Pressable
        onPress={() => setRemember((r) => !r)}
        style={styles.remember}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: remember }}
        hitSlop={8}>
        <View style={[styles.box, remember && styles.boxOn]}>{remember && <Icon name="check" size={16} color={colors.onPrimary} />}</View>
        <Text style={type.body}>Remember me on this device</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={busy ? 'One moment…' : mode === 'up' ? 'Create account' : 'Log in'} onPress={submit} disabled={busy} style={styles.btn} />
      <Text style={[type.caption, styles.note]}>
        There’s no email to reset a forgotten password, so pick one you’ll remember. What group-mates can see follows
        Settings → Privacy and is enforced on the server.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.textSecondary, marginBottom: space.xl },
  name: { marginTop: 2 },
  status: { marginTop: space.sm },
  err: { color: colors.danger },
  btn: { marginTop: space.lg },
  section: { marginTop: space.xl },
  field: { marginTop: space.lg },
  remember: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg, alignSelf: 'flex-start' },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  error: { color: colors.danger, marginTop: space.md },
  topError: { marginTop: 0, marginBottom: space.md },
  note: { marginTop: space.lg, textAlign: 'center' },
  link: { color: colors.primary, fontWeight: '600' },
});
