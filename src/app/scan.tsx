import { router } from 'expo-router';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { exerciseIconColor, Icon } from '@/components/Icon';
import { ScanReview } from '@/components/ScanReview';
import { goBack } from '@/components/nav';
import { showToast } from '@/components/toast';
import { Button, Card, Divider, Notice, Screen, SectionHeader, StackHeader } from '@/components/ui';
import { formatClock, formatRelativeDay } from '@/domain/dates';
import { describeEntry } from '@/domain/describe';
import { getExercise } from '@/domain/exercises';
import { useClock, useUnits } from '@/hooks/today';
import { PhotoAccessError } from '@/scan/photo';
import { enterManually, resetScan, saveDraft, scanFrom, undoScan, useScan, type ScanStage } from '@/scan';
import { useStore } from '@/store/store';
import { colors, radius, space, type } from '@/theme';

const STAGE_TEXT: Record<ScanStage, string> = {
  text: 'Reading the text on this device…',
  understanding: 'Understanding the workout…',
  ai: 'Asking the on-device AI what kind of workout this is…',
  cloud: 'Reading the photo in the cloud…',
};

/**
 * Scan a workout: shows the photo, reads it, and lists what was added — with Edit and Undo.
 * Reached from the camera button in the tab bar (which already took the photo) or from Log.
 */
export default function ScanScreen() {
  const { today, tz } = useClock();
  const prefs = useUnits();
  const scan = useScan(
    useShallow((s) => ({
      status: s.status,
      stage: s.stage,
      image: s.image,
      saved: s.saved,
      duplicates: s.duplicates,
      notes: s.notes,
      message: s.message,
      via: s.via,
      aiCouldHelp: s.aiCouldHelp,
      draft: s.draft,
      run: s.run,
    })),
  );
  const cloud = useStore((s) => s.settings.cloudPhotoReading);

  // Must stay synchronous up to the picker so the browser allows the camera to open.
  const pick = (source: 'camera' | 'library') => {
    scanFrom(source).catch((e) => showToast(e instanceof PhotoAccessError ? e.message : 'Couldn’t open the camera.'));
  };

  const done = () => {
    resetScan();
    goBack();
  };

  return (
    <Screen header={<StackHeader title="Scan a workout" />}>
      {scan.image ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: scan.image.uri }} style={styles.photo} resizeMode="contain" accessibilityLabel="Your workout photo" />
        </View>
      ) : (
        <Card style={styles.intro}>
          <Icon name="watch-variant" size={40} color={colors.primary} />
          <Text style={type.section}>Log a workout from a photo</Text>
          <Text style={[type.small, styles.center]}>
            Take a photo of your Apple Watch workout summary — or choose a screenshot from the Fitness app. FORM reads the
            workout type, time, distance, calories and heart rate and adds it to your log.
          </Text>
        </Card>
      )}

      {scan.status === 'reading' && (
        <View style={styles.reading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.body, styles.flexText]}>{scan.stage ? STAGE_TEXT[scan.stage] : 'Reading your workout…'}</Text>
        </View>
      )}

      {scan.status === 'review' && scan.draft && (
        <ScanReview
          // A new photo starts a fresh form.
          key={scan.run}
          draft={scan.draft}
          prefs={prefs}
          onSave={(w) => {
            const ok = saveDraft(w);
            if (ok) showToast('Workout saved');
            return ok;
          }}
          onDiscard={done}
        />
      )}
      {scan.status === 'review' && scan.aiCouldHelp && <AiHint />}

      {scan.status === 'saved' && (
        <>
          {scan.saved.length > 0 && (
            <>
              <SectionHeader
                title={scan.saved.length === 1 ? 'Added to your log' : `Added ${scan.saved.length} workouts`}
                right={scan.via === 'cloud' ? 'Read in the cloud' : scan.via === 'device-ai' ? 'On this device · AI' : 'On this device'}
                style={styles.section}
              />
              <Card padded={false} style={styles.clip}>
                {scan.saved.map((s, i) => {
                  const entry = s.entries[0];
                  const ex = getExercise(entry.exerciseId);
                  return (
                    <View key={s.id}>
                      {i > 0 && <Divider inset={space.lg} />}
                      <View style={styles.row}>
                        <View style={styles.iconBubble}>
                          <Icon name={ex.icon} size={22} color={exerciseIconColor(ex.id)} />
                        </View>
                        <View style={styles.flex}>
                          <Text style={type.bodyStrong}>{ex.name}</Text>
                          <Text style={type.small}>
                            {formatRelativeDay(s.date, today)} · {formatClock(s.performedAt, tz)}
                          </Text>
                          <Text style={[type.body, styles.desc]}>{describeEntry(entry, prefs)}</Text>
                        </View>
                        <Icon name="check-circle" size={22} color={colors.primary} />
                      </View>
                      <View style={styles.rowActions}>
                        <Button
                          label="Edit"
                          icon="pencil-outline"
                          compact
                          variant="secondary"
                          onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
                        />
                      </View>
                    </View>
                  );
                })}
              </Card>
            </>
          )}
          {scan.aiCouldHelp && <AiHint />}
          {scan.duplicates.length > 0 && (
            <Notice icon="information-outline">
              {scan.duplicates.length === 1
                ? `${scan.duplicates[0].title} is already in your log, so it wasn’t added again.`
                : `${scan.duplicates.length} of these workouts are already in your log, so they weren’t added again.`}
            </Notice>
          )}
        </>
      )}

      {(scan.status === 'nothing' || scan.status === 'error' || scan.status === 'unavailable') && (
        <Card style={styles.problem}>
          <Icon
            name={scan.status === 'unavailable' ? 'robot-off-outline' : scan.status === 'error' ? 'alert-circle-outline' : 'image-search-outline'}
            size={28}
            color={scan.status === 'error' ? colors.danger : colors.textSecondary}
          />
          <Text style={[type.bodyStrong, styles.center]}>
            {scan.status === 'unavailable'
              ? 'Photos can’t be read in this version'
              : scan.status === 'error'
                ? 'The photo couldn’t be read'
                : (scan.message ?? 'No workout found in this photo')}
          </Text>
          <Text style={[type.small, styles.center]}>
            {scan.status === 'unavailable'
              ? scan.message
              : scan.status === 'error'
                ? scan.message
                : 'Try again with the watch screen filling more of the photo and less glare — or enter the numbers yourself.'}
          </Text>
          {scan.status === 'nothing' && <Button label="Enter it yourself" icon="pencil-outline" onPress={enterManually} />}
          {scan.status === 'unavailable' && (
            <Button label="Log it manually" icon="plus-circle-outline" variant="secondary" onPress={() => router.navigate({ pathname: '/log', params: { category: 'cardio' } })} />
          )}
        </Card>
      )}
      {scan.status === 'nothing' && scan.aiCouldHelp && <AiHint />}

      {scan.notes.length > 0 && scan.status !== 'reading' && (
        <View style={styles.notes}>
          {scan.notes.map((n, i) => (
            <Text key={i} style={type.caption}>
              • {n}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        {scan.status === 'saved' && scan.saved.length > 0 && (
          <>
            <Button label="Done" icon="check" onPress={done} />
            <Button
              label="Undo"
              icon="undo-variant"
              variant="ghost"
              onPress={() => {
                undoScan();
                showToast('Removed from your log');
              }}
            />
          </>
        )}
        {scan.status !== 'reading' && (
          <>
            <Button
              label={scan.image ? 'Take another photo' : 'Take a photo'}
              icon="camera-outline"
              variant={(scan.status === 'saved' && scan.saved.length) || scan.status === 'review' ? 'secondary' : 'primary'}
              onPress={() => pick('camera')}
            />
            <Button label="Choose a screenshot" icon="image-outline" variant="secondary" onPress={() => pick('library')} />
            <Button
              label="Read text on this device"
              icon="text-recognition"
              variant="ghost"
              onPress={() => router.push(scan.image ? { pathname: '/ocr', params: { photo: 'scan' } } : '/ocr')}
            />
          </>
        )}
      </View>

      <Text style={[type.caption, styles.privacy]}>
        {cloud
          ? 'Photos are read on this device. Only if that fails are they sent to the cloud reader (you can turn this off in Settings).'
          : 'Photos are read on this device and never uploaded.'}{' '}
        Calories and heart rate stay on this device and aren’t shared with groups.
      </Text>
    </Screen>
  );
}

/** Offers the on-device AI when it would have recognized the workout's name. */
function AiHint() {
  return (
    <View style={styles.hint}>
      <Notice icon="creation-outline">
        This workout’s name wasn’t recognized, so it was saved as its own exercise. The on-device AI can tell what kind of workout it is.{' '}
        <Text style={styles.link} onPress={() => router.push('/settings')}>
          Get the on-device AI
        </Text>
      </Notice>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexText: { flexShrink: 1 },
  hint: { marginBottom: space.md },
  link: { color: colors.primary, fontWeight: '600' },
  center: { textAlign: 'center' },
  intro: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, marginTop: space.sm },
  photoWrap: {
    marginTop: space.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { width: '100%', height: 240 },
  reading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.xl },
  section: { marginTop: space.xl },
  clip: { overflow: 'hidden', marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.lg },
  rowActions: { flexDirection: 'row', paddingHorizontal: space.lg, paddingBottom: space.md, paddingTop: space.sm, paddingLeft: 52 + space.lg },
  iconBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  desc: { marginTop: 2, color: colors.textSecondary },
  problem: { alignItems: 'center', gap: space.sm, marginTop: space.lg, paddingVertical: space.xl },
  notes: { marginTop: space.md, gap: 4 },
  actions: { gap: space.sm, marginTop: space.xl },
  privacy: { marginTop: space.lg, textAlign: 'center' },
});
