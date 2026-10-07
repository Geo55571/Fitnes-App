import { useEffect } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { downloadLocalAi, refreshLocalAi, removeLocalAi, useLocalAi } from '@/ai';
import { colors, radius, space, type } from '@/theme';

import { confirmAction } from './confirm';
import { Icon } from './Icon';
import { Button, Divider } from './ui';

/** Settings → Photo reading: the on-device AI model and the (off by default) cloud fallback. */
export function LocalAiSettings({ cloud, onCloudChange }: { cloud: boolean; onCloudChange: (v: boolean) => void }) {
  const ai = useLocalAi();

  useEffect(() => {
    void refreshLocalAi();
  }, []);

  const size = ai.model ? (ai.model.sizeMB >= 1000 ? `${(ai.model.sizeMB / 1000).toFixed(1)} GB` : `${ai.model.sizeMB} MB`) : '';

  return (
    <>
      <View style={styles.row}>
        <Icon name="text-recognition" size={22} color={colors.primary} />
        <View style={styles.flex}>
          <Text style={type.body}>Read on this device</Text>
          <Text style={type.small}>Text and numbers in workout photos are read on your phone, offline. Always on.</Text>
        </View>
      </View>
      <Divider inset={52} />
      <View style={styles.row}>
        <Icon name="creation-outline" size={22} color={ai.status === 'ready' ? colors.primary : colors.textSecondary} />
        <View style={styles.flex}>
          <Text style={type.body}>On-device AI{ai.model ? ` · ${ai.model.label}` : ''}</Text>
          <Text style={type.small}>
            {ai.status === 'ready'
              ? 'Ready, works offline. Recognizes workout types the app doesn’t know by name — in any language.'
              : ai.status === 'downloading'
                ? `${ai.detail ?? 'Downloading…'} ${Math.round(ai.progress * 100)}%`
                : ai.status === 'absent'
                  ? `A small AI model that runs on this device and recognizes any workout type by its name. One-time download of ${size}; nothing you photograph is sent anywhere.`
                  : ai.status === 'checking'
                    ? 'Checking this device…'
                    : (ai.detail ?? 'Not available on this device.')}
          </Text>
          {ai.status === 'downloading' && (
            <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ai.progress * 100) }}>
              <View style={[styles.fill, { width: `${Math.max(2, ai.progress * 100)}%` }]} />
            </View>
          )}
          {(ai.status === 'absent' || ai.status === 'error') && (
            <Button
              label={ai.status === 'error' ? 'Try again' : `Download (${size})`}
              icon="download"
              compact
              onPress={() => void downloadLocalAi()}
              style={styles.btn}
            />
          )}
          {ai.status === 'ready' && (
            <Button
              label="Remove"
              icon="delete-outline"
              compact
              variant="secondary"
              onPress={() =>
                confirmAction('Remove the on-device AI?', `This frees about ${size}. Photos are still read on this device without it.`, 'Remove', () => {
                  void removeLocalAi();
                })
              }
              style={styles.btn}
            />
          )}
        </View>
      </View>
      <Divider />
      <View style={styles.row}>
        <Icon name="cloud-outline" size={22} color={colors.textSecondary} />
        <View style={styles.flex}>
          <Text style={type.body}>Cloud reading if this device can’t</Text>
          <Text style={type.small}>Sends the photo to FORM’s server (read by Claude) only when it couldn’t be read here. Off keeps everything on your phone.</Text>
        </View>
        <Switch
          value={cloud}
          onValueChange={onCloudChange}
          trackColor={{ true: colors.primary, false: colors.track }}
          thumbColor="#fff"
          accessibilityLabel="Cloud reading if this device can’t"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.lg },
  btn: { alignSelf: 'flex-start', marginTop: space.sm },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.track, marginTop: space.sm, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
});
