import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { showToast } from '@/components/toast';
import { Button, Card, Divider, Notice, Screen, SectionHeader, Segmented, StackHeader } from '@/components/ui';
import { classifyWithLocalAi } from '@/ai';
import { formatMonthDay } from '@/domain/dates';
import { describeEntry, describeStats } from '@/domain/describe';
import { formatDistance, formatDuration, trimNumber } from '@/domain/units';
import { interpretWorkoutText, withActivity } from '@/domain/workoutInterpreter';
import { planScan } from '@/domain/workoutScan';
import { useClock, useUnits } from '@/hooks/today';
import { ocrAvailability, recognizeText, releaseEngine, type OcrLevel, type OcrResult, type RecognizedNumber } from '@/ocr';
import { logReading, useScan } from '@/scan';
import { PhotoAccessError, pickImage, type PickedImage } from '@/scan/photo';
import { colors, radius, space, tabular, type } from '@/theme';

const KIND_LABEL: Record<RecognizedNumber['kind'], string> = {
  integer: 'Number',
  decimal: 'Decimal',
  percent: 'Percent',
  currency: 'Money',
  time: 'Time',
  measurement: 'Measurement',
};

const ENGINE_LABEL: Record<string, string> = {
  'apple-vision': 'Apple Vision',
  'google-mlkit': 'Google ML Kit',
  'tesseract-wasm': 'Tesseract (in your browser)',
};

const PREVIEW_HEIGHT = 260;

function formatValue(n: RecognizedNumber): string {
  if (n.kind === 'time') return n.rawText.trim();
  const v = Number.isInteger(n.value) ? String(n.value) : trimNumber(n.value, 4);
  if (!n.unit) return v;
  if (n.kind === 'currency' && n.unit.length === 1) return `${n.unit}${v}`;
  return n.unit === '%' || n.unit.startsWith('°') ? `${v}${n.unit}` : `${v} ${n.unit}`;
}

const pct = (c: number | null) => (c === null ? null : `${Math.round(c * 100)}%`);

/**
 * Read text: recognizes text and numbers in a photo entirely on this device.
 * Opened from Scan a workout (optionally with that photo: ?photo=scan).
 */
export default function OcrScreen() {
  const params = useLocalSearchParams<{ photo?: string }>();
  const support = ocrAvailability();
  const [image, setImage] = useState<PickedImage | null>(() => {
    const scanned = params.photo === 'scan' ? useScan.getState().image : null;
    return scanned ? { uri: scanned.uri, width: 0, height: 0 } : null;
  });
  const [level, setLevel] = useState<OcrLevel>('accurate');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ status: string; progress: number | null } | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const runId = useRef(0);

  // Free the engine when leaving the screen.
  useEffect(() => () => releaseEngine(), []);

  const scan = (img: PickedImage, lvl: OcrLevel) => {
    if (!support.available) return;
    const id = ++runId.current;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    recognizeText(img.uri, {
      level: lvl,
      size: img.width && img.height ? { width: img.width, height: img.height } : undefined,
      onProgress: (p) => id === runId.current && setProgress(p),
    })
      .then((r) => id === runId.current && setResult(r))
      .catch((e) => id === runId.current && setError(e instanceof Error ? e.message : 'The text couldn’t be read.'))
      .finally(() => {
        if (id !== runId.current) return;
        setRunning(false);
        setProgress(null);
      });
  };

  // Must stay synchronous up to the picker so the browser allows the camera to open.
  const pick = (source: 'camera' | 'library') => {
    pickImage(source)
      .then((img) => {
        if (!img) return;
        setImage(img);
        scan(img, level);
      })
      .catch((e) => showToast(e instanceof PhotoAccessError ? e.message : 'Couldn’t open the camera.'));
  };

  const copy = async () => {
    if (!result?.fullText) return;
    await Clipboard.setStringAsync(result.fullText);
    showToast('Text copied');
  };

  // Where the image is drawn inside the preview (contain), for the line outlines.
  const imgSize = result?.imageSize ?? (image?.width ? { width: image.width, height: image.height } : null);
  let drawn: { x: number; y: number; w: number; h: number } | null = null;
  if (frame && imgSize) {
    const s = Math.min(frame.w / imgSize.width, frame.h / imgSize.height);
    drawn = { w: imgSize.width * s, h: imgSize.height * s, x: (frame.w - imgSize.width * s) / 2, y: (frame.h - imgSize.height * s) / 2 };
  }

  return (
    <Screen header={<StackHeader title="Read text" />}>
      <Notice icon="cellphone-lock">Reads text and numbers on this device. Your photo isn’t uploaded anywhere.</Notice>
      {!support.available && (
        <View style={styles.block}>
          <Notice icon="alert-circle-outline">{support.reason}</Notice>
        </View>
      )}

      {/* Preview */}
      <View
        style={styles.preview}
        onLayout={(e) => setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        accessibilityLabel={image ? 'Selected image' : undefined}>
        {image ? (
          <>
            <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            {drawn &&
              result?.textBlocks.map((b, i) =>
                b.box ? (
                  <View
                    key={i}
                    style={[
                      styles.box,
                      {
                        left: drawn.x + b.box.x * drawn.w - 2,
                        top: drawn.y + b.box.y * drawn.h - 2,
                        width: b.box.width * drawn.w + 4,
                        height: b.box.height * drawn.h + 4,
                      },
                    ]}
                  />
                ) : null,
              )}
          </>
        ) : (
          <View style={styles.placeholder}>
            <Icon name="text-recognition" size={40} color={colors.textTertiary} />
            <Text style={[type.small, styles.center]}>Take a photo or choose an image to read its text.</Text>
          </View>
        )}
      </View>

      <View style={styles.row}>
        <Button label="Take photo" icon="camera-outline" variant="secondary" onPress={() => pick('camera')} style={styles.flex} />
        <Button label="Choose image" icon="image-outline" variant="secondary" onPress={() => pick('library')} style={styles.flex} />
      </View>

      <View style={styles.block}>
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: 'accurate', label: 'Accurate' },
            { value: 'fast', label: 'Fast' },
          ]}
        />
      </View>

      <Button
        label={running ? 'Reading…' : result ? 'Scan again' : 'Scan text'}
        icon="text-recognition"
        onPress={() => image && scan(image, level)}
        disabled={!image || running || !support.available}
        style={styles.block}
      />

      {running && (
        <View style={styles.progress} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text style={type.body}>
            {progress?.status ?? 'Reading text…'}
            {progress?.progress !== null && progress?.progress !== undefined && progress.status === 'Reading text…'
              ? ` ${Math.round(progress.progress * 100)}%`
              : ''}
          </Text>
        </View>
      )}

      {error && !running && (
        <Card style={styles.message}>
          <Icon name="alert-circle-outline" size={26} color={colors.danger} />
          <Text style={type.bodyStrong}>The text couldn’t be read</Text>
          <Text style={[type.small, styles.center]}>{error}</Text>
        </Card>
      )}

      {result && !running && result.textBlocks.length === 0 && (
        <Card style={styles.message}>
          <Icon name="text-box-search-outline" size={26} color={colors.textSecondary} />
          <Text style={type.bodyStrong}>No text found</Text>
          <Text style={[type.small, styles.center]}>
            Hold the camera steady, fill the frame with the text and avoid glare. Try Accurate if Fast is on.
          </Text>
        </Card>
      )}

      {result && !running && result.textBlocks.length > 0 && (
        <>
          <SectionHeader title="Recognized text" right={`${result.textBlocks.length} ${result.textBlocks.length === 1 ? 'line' : 'lines'}`} style={styles.section} />
          <Card>
            {result.textBlocks.map((b, i) => (
              <Text
                key={i}
                selectable
                style={[styles.line, b.confidence !== null && b.confidence < 0.5 && styles.unsure]}
                accessibilityLabel={b.confidence !== null && b.confidence < 0.5 ? `${b.text} (uncertain)` : b.text}>
                {b.text}
              </Text>
            ))}
          </Card>

          <SectionHeader title="Detected numbers" right={result.numbers.length ? String(result.numbers.length) : undefined} style={styles.section} />
          <Card padded={false} style={styles.clip}>
            {result.numbers.length === 0 ? (
              <Text style={[type.small, styles.pad]}>No numbers in this image.</Text>
            ) : (
              result.numbers.map((n, i) => (
                <View key={i}>
                  {i > 0 && <Divider inset={space.lg} />}
                  <View style={styles.numRow}>
                    <View style={styles.flex}>
                      <Text style={[type.bodyStrong, tabular]} selectable>
                        {formatValue(n)}
                      </Text>
                      <Text style={type.caption}>
                        {KIND_LABEL[n.kind]} · read as “{n.rawText.trim()}”
                      </Text>
                    </View>
                    {n.confidence !== null && (
                      <Text style={[type.caption, tabular, n.confidence < 0.5 && styles.low]}>{pct(n.confidence)}</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </Card>

          {result.dates.length > 0 && (
            <>
              <SectionHeader title="Dates" style={styles.section} />
              <Card padded={false} style={styles.clip}>
                {result.dates.map((d, i) => (
                  <View key={i}>
                    {i > 0 && <Divider inset={space.lg} />}
                    <View style={styles.numRow}>
                      <Text style={[type.bodyStrong, styles.flex]}>{d.iso ? `${formatMonthDay(d.iso)}, ${d.year}` : d.rawText}</Text>
                      <Text style={type.caption}>{d.iso ? `read as “${d.rawText}”` : 'year or order unclear'}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          )}

          <WorkoutFromText result={result} />

          <Button label="Copy text" icon="content-copy" variant="secondary" onPress={copy} style={styles.section} />
          <Text style={[type.caption, styles.meta]}>
            {ENGINE_LABEL[result.engine] ?? result.engine} · {result.level === 'fast' ? 'Fast' : 'Accurate'} · {(result.durationMs / 1000).toFixed(1)} s ·{' '}
            {result.imageSize.width}×{result.imageSize.height}
          </Text>
        </>
      )}
    </Screen>
  );
}

/**
 * If the text is a workout summary, offers to add it to the log — read by the same on-device
 * interpreter (and AI, for unknown workout names) as the camera button.
 */
function WorkoutFromText({ result }: { result: OcrResult }) {
  const { today } = useClock();
  const prefs = useUnits();
  const interp = useMemo(
    () => interpretWorkoutText(result.textBlocks, { today, distanceUnit: prefs.distanceUnit, icon: result.icon }),
    [result, today, prefs.distanceUnit],
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'duplicate'>('idle');
  const w = interp.reading.workouts[0];
  if (!interp.reading.is_workout_summary || !w) return null;
  // A time alone (a receipt, a note) isn't enough to suggest logging a workout here.
  if (!interp.found.activity && [w.distance, w.active_kcal ?? w.total_kcal, w.avg_heart_rate].every((v) => v === null)) return null;

  const preview = planScan(interp.reading, { today, tz: 'UTC', now: new Date(), sessions: [] }).workouts[0];
  const add = async () => {
    setState('saving');
    let reading = interp;
    if (interp.unknownName) {
      const activity = await classifyWithLocalAi(interp.unknownName);
      if (activity && activity !== 'other') reading = withActivity(interp, activity);
    }
    const { saved, duplicates } = logReading(reading.reading);
    setState(saved.length ? 'saved' : duplicates.length ? 'duplicate' : 'idle');
    showToast(saved.length ? 'Workout added to your log' : duplicates.length ? 'Already in your log' : 'Nothing could be added');
  };

  return (
    <Card style={styles.workout}>
      <View style={styles.workoutHead}>
        <Icon name="watch-variant" size={22} color={colors.primary} />
        <Text style={[type.bodyStrong, styles.flex]}>Looks like a workout: {w.title}</Text>
      </View>
      {preview && (
        <Text style={[type.small, tabular]}>
          {preview.exerciseId
            ? describeEntry({ ...preview.entry, id: 'preview', exerciseId: preview.exerciseId }, prefs)
            : [
                preview.entry.distanceM ? formatDistance(preview.entry.distanceM, prefs.distanceUnit) : null,
                preview.entry.durationSec ? formatDuration(preview.entry.durationSec) : null,
                describeStats(preview.entry.stats),
              ]
                .filter(Boolean)
                .join(' · ')}
        </Text>
      )}
      {state === 'saved' ? (
        <Button label="Open Today" icon="home-outline" variant="secondary" compact onPress={() => router.navigate('/')} style={styles.workoutBtn} />
      ) : (
        <Button
          label={state === 'saving' ? 'Adding…' : state === 'duplicate' ? 'Already in your log' : 'Add to log'}
          icon="plus-circle-outline"
          compact
          disabled={state !== 'idle'}
          onPress={() => void add()}
          style={styles.workoutBtn}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  workout: { marginTop: space.xl, gap: space.sm },
  workoutHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  workoutBtn: { alignSelf: 'flex-start', marginTop: space.xs },
  block: { marginTop: space.md },
  preview: {
    height: PREVIEW_HEIGHT,
    marginTop: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl },
  box: { position: 'absolute', borderWidth: 1.5, borderColor: colors.coral, borderRadius: 3, pointerEvents: 'none' },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.lg },
  message: { alignItems: 'center', gap: space.sm, marginTop: space.lg, paddingVertical: space.xl },
  section: { marginTop: space.xl },
  line: { fontSize: 15, lineHeight: 22, color: colors.text },
  unsure: { color: colors.textTertiary },
  clip: { overflow: 'hidden' },
  pad: { padding: space.lg },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 11 },
  low: { color: colors.danger },
  meta: { marginTop: space.md, textAlign: 'center' },
});
