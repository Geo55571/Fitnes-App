import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { confirmAction } from '@/components/confirm';
import { showToast } from '@/components/toast';
import { Button, Card, Divider, Notice, Screen, SectionHeader, StackHeader } from '@/components/ui';
import { makeBackup, parseBackup, sessionsToCsv, type BackupData } from '@/domain/backup';
import { formatDayShort, timeAgo } from '@/domain/dates';
import { useToday } from '@/hooks/today';
import { pickTextFile, saveFile } from '@/services/files';
import { useStore } from '@/store/store';
import { colors, space, type } from '@/theme';

interface Pending {
  data: BackupData;
  skipped: number;
}

export default function BackupScreen() {
  const today = useToday();
  const { lastBackupAt, sessionCount, goalCount, exportData, importData, updateProfile } = useStore(
    useShallow((s) => ({
      lastBackupAt: s.profile.lastBackupAt,
      sessionCount: s.sessions.length,
      goalCount: s.goals.length,
      exportData: s.exportData,
      importData: s.importData,
      updateProfile: s.updateProfile,
    })),
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () =>
    run(async () => {
      const file = makeBackup(exportData());
      const ok = await saveFile(`form-backup-${today}.json`, JSON.stringify(file, null, 1), 'application/json', 'public.json');
      if (!ok) return showToast('Sharing isn’t available on this device.');
      updateProfile({ lastBackupAt: file.exportedAt });
      showToast('Backup exported');
    });

  const exportCsv = () =>
    run(async () => {
      const ok = await saveFile(`form-sessions-${today}.csv`, sessionsToCsv(exportData().sessions), 'text/csv', 'public.comma-separated-values-text');
      if (ok) showToast('Sessions exported');
    });

  const pickImport = () =>
    run(async () => {
      const text = await pickTextFile();
      if (text === null) return;
      const res = parseBackup(text);
      if (!res.ok) return showToast(res.error);
      setPending({ data: res.data, skipped: res.skipped });
    });

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return;
    const doIt = () => {
      importData(pending.data, mode);
      setPending(null);
      showToast(mode === 'merge' ? 'Backup merged' : 'Backup restored');
    };
    if (mode === 'replace') {
      confirmAction('Replace all data?', 'Everything on this device is swapped for the backup. Export a backup first if unsure.', 'Replace', doIt);
    } else doIt();
  };

  return (
    <Screen header={<StackHeader title="Backup & export" />}>
      <Card>
        <Text style={type.bodyStrong}>
          {lastBackupAt ? `Last backup ${timeAgo(lastBackupAt)} · ${formatDayShort(lastBackupAt.slice(0, 10))}` : 'No backup yet'}
        </Text>
        <Text style={[type.small, styles.gap]}>
          {sessionCount} sessions and {goalCount} goals are stored on this device only. A backup file lets you restore them on a
          new phone or after reinstalling.
        </Text>
        <Button label="Export backup" icon="content-copy" onPress={exportJson} disabled={busy} style={styles.btn} />
      </Card>

      <SectionHeader title="Restore" style={styles.section} />
      <Card>
        {pending ? (
          <View>
            <Text style={type.bodyStrong}>Backup ready to import</Text>
            <Text style={[type.small, styles.gap]}>
              {pending.data.sessions.length} sessions · {pending.data.goals.length} goals · {pending.data.groups.length} groups
              {pending.skipped ? ` · ${pending.skipped} damaged records will be skipped` : ''}
            </Text>
            <Button label="Merge into my data" onPress={() => apply('merge')} style={styles.btn} />
            <Text style={[type.caption, styles.gapSm]}>Adds anything missing. Where a session exists in both, the most recently edited copy is kept.</Text>
            <Divider />
            <Button label="Replace all data" variant="danger" compact onPress={() => apply('replace')} style={styles.btn} />
            <Button label="Cancel" variant="ghost" compact onPress={() => setPending(null)} style={styles.btnSm} />
          </View>
        ) : (
          <>
            <Text style={type.small}>Choose a FORM backup file (.json). You’ll see what it contains before anything changes.</Text>
            <Button label="Import backup" variant="secondary" onPress={pickImport} disabled={busy} style={styles.btn} />
          </>
        )}
      </Card>

      <SectionHeader title="Spreadsheet" style={styles.section} />
      <Card>
        <Text style={type.small}>
          Every set, run and hold as a CSV file for Excel, Numbers or Google Sheets. Weights are in kg, distances in km, times in
          seconds.
        </Text>
        <Button label="Export sessions (CSV)" variant="secondary" onPress={exportCsv} disabled={busy} style={styles.btn} />
      </Card>

      <View style={styles.section}>
        <Notice icon="shield-lock-outline">Backup files contain your full history. Store them somewhere private.</Notice>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: space.sm },
  gapSm: { marginTop: space.sm, marginBottom: space.md, color: colors.textSecondary },
  btn: { marginTop: space.lg },
  btnSm: { marginTop: space.xs },
  section: { marginTop: space.xl },
});
