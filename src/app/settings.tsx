import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { confirmAction } from '@/components/confirm';
import { Icon } from '@/components/Icon';
import { LocalAiSettings } from '@/components/LocalAiSettings';
import { showToast } from '@/components/toast';
import { Button, Card, Chip, ChipRow, Divider, Field, ListRow, Screen, Segmented, Sheet, StackHeader } from '@/components/ui';
import { COMMON_TIME_ZONES, deviceTimeZone, resolveTimeZone, timeAgo } from '@/domain/dates';
import type { Settings, SharingLevel } from '@/domain/types';
import { ensurePermission, remindersSupported } from '@/hooks/reminders';
import { useToday } from '@/hooks/today';
import { useStore } from '@/store/store';
import { syncLabel, useSync } from '@/sync';
import { colors, space, type } from '@/theme';

const REMINDER_TIMES: [number, number][] = [
  [12, 0],
  [17, 0],
  [18, 0],
  [19, 30],
];

type NudgeKey = 'reminderEnabled' | 'nudgeStreak' | 'nudgeChallenges' | 'weeklySummary';

const NUDGES: { key: NudgeKey; title: string; body: string }[] = [
  { key: 'reminderEnabled', title: 'Goal reminder', body: 'In the evening, if goals aren’t done: exactly what’s left, e.g. “3 push-ups and 2 km to go”.' },
  { key: 'nudgeStreak', title: 'Streak protection', body: 'At 20:30 if nothing is logged and a 3+ day streak would end.' },
  { key: 'nudgeChallenges', title: 'Challenge finish', body: 'On a challenge’s last day: where you stand and how far behind the leader.' },
  { key: 'weeklySummary', title: 'Weekly summary', body: 'Sunday at 19:00: sessions, active days and your biggest change.' },
];

const SHARING: { value: SharingLevel; label: string; body: string }[] = [
  { value: 'everything', label: 'All activity', body: 'Group members can see your sessions and daily totals.' },
  { value: 'challenges', label: 'Challenge results only', body: 'Members see your totals in shared challenges, nothing else.' },
  { value: 'private', label: 'Private', body: 'Nothing is shared. You won’t appear with a score on leaderboards.' },
];

export default function SettingsScreen() {
  const today = useToday();
  const s = useStore(
    useShallow((st) => ({
      profile: st.profile,
      settings: st.settings,
      demoLoaded: st.demoLoaded,
      updateProfile: st.updateProfile,
      updateSettings: st.updateSettings,
      loadDemo: st.loadDemo,
      clearDemo: st.clearDemo,
      resetAll: st.resetAll,
    })),
  );
  const syncState = useSync();
  const [tzOpen, setTzOpen] = useState(false);
  const [name, setName] = useState(s.profile.name);
  const set = s.updateSettings;

  /** Turning any nudge on asks for permission first; scheduling itself is handled by ReminderSync. */
  const toggleNudge = async (key: NudgeKey, on: boolean) => {
    if (on) {
      const res = await ensurePermission();
      if (res === 'denied') return showToast('Notifications are blocked. Enable them in system settings.');
      if (res === 'unsupported') return;
    }
    set({ [key]: on } as Partial<Settings>);
  };

  const tzLabel = s.settings.timeZone === 'auto' ? `Automatic (${deviceTimeZone()})` : s.settings.timeZone;

  return (
    <Screen header={<StackHeader title="Settings" />}>
      <Group title="Profile & account">
        <View style={styles.pad}>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            onBlur={() => name.trim() && s.updateProfile({ name: name.trim() })}
            onSubmitEditing={() => name.trim() && s.updateProfile({ name: name.trim() })}
            returnKeyType="done"
            maxLength={40}
          />
        </View>
        <Divider />
        <ListRow
          icon="account-group"
          title="Account"
          subtitle={syncState.userId ? `${syncState.name ?? 'Logged in'} · ${syncLabel(syncState)}` : 'Create one with just a name — no email'}
          onPress={() => router.push('/account')}
        />
      </Group>

      <Group title="Units & time">
        <View style={styles.pad}>
          <Text style={styles.label}>Distance</Text>
          <Segmented
            value={s.settings.distanceUnit}
            onChange={(v) => set({ distanceUnit: v })}
            options={[
              { value: 'km', label: 'Kilometers' },
              { value: 'mi', label: 'Miles' },
            ]}
          />
          <Text style={[styles.label, styles.mt]}>Weight</Text>
          <Segmented
            value={s.settings.weightUnit}
            onChange={(v) => set({ weightUnit: v })}
            options={[
              { value: 'kg', label: 'Kilograms' },
              { value: 'lb', label: 'Pounds' },
            ]}
          />
        </View>
        <Divider />
        <ListRow icon="earth" title={tzLabel} subtitle="Daily goals reset at midnight in this time zone." onPress={() => setTzOpen(true)} />
      </Group>

      <Group title="Notifications">
        {!remindersSupported && <Text style={[type.small, styles.pad]}>Notifications are available in the iOS and Android app.</Text>}
        {NUDGES.map((n, i) => (
          <View key={n.key}>
            {i > 0 && <Divider inset={space.lg} />}
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={type.body}>{n.title}</Text>
                <Text style={type.small}>{n.body}</Text>
              </View>
              <Switch
                value={s.settings[n.key]}
                onValueChange={(v) => toggleNudge(n.key, v)}
                disabled={!remindersSupported}
                trackColor={{ true: colors.primary, false: colors.track }}
                thumbColor="#fff"
                accessibilityLabel={n.title}
              />
            </View>
            {n.key === 'reminderEnabled' && s.settings.reminderEnabled && (
              <View style={styles.padBottom}>
                <ChipRow>
                  {REMINDER_TIMES.map(([h, m]) => (
                    <Chip
                      key={`${h}:${m}`}
                      label={`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`}
                      selected={s.settings.reminderHour === h && s.settings.reminderMinute === m}
                      onPress={() => set({ reminderHour: h, reminderMinute: m })}
                    />
                  ))}
                </ChipRow>
              </View>
            )}
          </View>
        ))}
      </Group>

      <Group title="Privacy">
        {SHARING.map((o, i) => {
          const on = s.settings.sharing === o.value;
          return (
            <View key={o.value}>
              {i > 0 && <Divider inset={52} />}
              <Pressable
                onPress={() => set({ sharing: o.value })}
                style={styles.radioRow}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}>
                <Icon name={on ? 'check-circle' : 'circle-outline'} size={22} color={on ? colors.primary : colors.textTertiary} />
                <View style={styles.flex}>
                  <Text style={type.body}>{o.label}</Text>
                  <Text style={type.small}>{o.body}</Text>
                </View>
              </Pressable>
            </View>
          );
        })}
        <Divider />
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={type.body}>Show me on leaderboards</Text>
            <Text style={type.small}>Turn off to take part in challenges without a public rank.</Text>
          </View>
          <Switch
            value={s.settings.showOnLeaderboards && s.settings.sharing !== 'private'}
            disabled={s.settings.sharing === 'private'}
            onValueChange={(v) => set({ showOnLeaderboards: v })}
            trackColor={{ true: colors.primary, false: colors.track }}
            thumbColor="#fff"
            accessibilityLabel="Show me on leaderboards"
          />
        </View>
        <Text style={[type.caption, styles.syncNote]}>
          {syncState.userId
            ? 'Applied to your shared groups and enforced by the server.'
            : 'Applied to shared groups when you log in.'}
        </Text>
      </Group>

      <Group title="Photo reading">
        <LocalAiSettings cloud={s.settings.cloudPhotoReading} onCloudChange={(v) => set({ cloudPhotoReading: v })} />
      </Group>

      <Group title="Data">
        <ListRow
          icon="content-copy"
          title="Backup & export"
          subtitle={s.profile.lastBackupAt ? `Last backup ${timeAgo(s.profile.lastBackupAt)}` : 'No backup yet'}
          onPress={() => router.push('/backup')}
        />
        <Divider inset={56} />
        <ListRow
          icon="flask-outline"
          title={s.demoLoaded ? 'Remove sample data' : 'Load sample data'}
          subtitle={s.demoLoaded ? 'Sample history, group and friends are loaded' : 'Example history, a group and friends to explore'}
          chevron={false}
          onPress={() => {
            if (s.demoLoaded) {
              s.clearDemo();
              showToast('Sample data removed');
            } else {
              s.loadDemo(today);
              showToast('Sample data loaded');
            }
          }}
        />
        <Divider />
        <View style={styles.pad}>
          <Button
            label="Erase all data"
            variant="danger"
            compact
            onPress={() =>
              confirmAction('Erase everything?', 'Sessions, goals, groups and settings on this device will be deleted.', 'Erase', () => {
                s.resetAll();
                router.replace('/welcome');
              })
            }
          />
        </View>
      </Group>

      <Sheet visible={tzOpen} onClose={() => setTzOpen(false)} title="Time zone">
        {['auto', ...COMMON_TIME_ZONES].map((z) => {
          const on = s.settings.timeZone === z;
          return (
            <Pressable
              key={z}
              onPress={() => {
                set({ timeZone: z });
                setTzOpen(false);
                showToast(`Time zone: ${resolveTimeZone(z)}`);
              }}
              style={styles.tzRow}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}>
              <Text style={[type.body, styles.flex]}>{z === 'auto' ? `Automatic (${deviceTimeZone()})` : z.replace(/_/g, ' ')}</Text>
              {on && <Icon name="check-bold" size={18} color={colors.primary} />}
            </Pressable>
          );
        })}
      </Sheet>
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <Card padded={false} style={styles.clip}>
        {children}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  group: { marginBottom: space.xl },
  groupTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: space.sm, marginLeft: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  clip: { overflow: 'hidden' },
  pad: { padding: space.lg },
  padBottom: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  mt: { marginTop: space.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  syncNote: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  tzRow: { flexDirection: 'row', alignItems: 'center', height: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
