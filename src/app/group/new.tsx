import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { showToast } from '@/components/toast';
import { Button, Field, Screen, StackHeader } from '@/components/ui';
import { useStore } from '@/store/store';
import { groupsApi, useSync } from '@/sync';
import { space, type } from '@/theme';

export default function NewGroup() {
  const createGroup = useStore((s) => s.createGroup);
  const [name, setName] = useState('');

  const signedIn = !!useSync((s) => s.userId);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (signedIn) {
      setBusy(true);
      try {
        const g = await groupsApi.create(name);
        showToast(`Created ${g.name}`);
        router.replace({ pathname: '/group/[id]', params: { id: g.id } });
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Couldn’t create the group.');
      } finally {
        setBusy(false);
      }
      return;
    }
    const g = createGroup(name);
    showToast(`Created ${g.name}`);
    router.replace({ pathname: '/group/[id]', params: { id: g.id } });
  };

  return (
    <Screen
      header={<StackHeader title="New group" />}
      footer={<Button label={busy ? 'Creating…' : 'Create group'} onPress={create} disabled={!name.trim() || busy} />}>
      <Field
        label="Group name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Morning crew"
        autoFocus
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={() => name.trim() && create()}
      />
      <Text style={[type.small, styles.note]}>
        {signedIn
          ? 'You’ll get an invite code to share. Friends who join see the group’s challenges and leaderboards.'
          : 'This group stays on this device. Create an account (Settings → Account) to create groups friends can join.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: space.md },
});
