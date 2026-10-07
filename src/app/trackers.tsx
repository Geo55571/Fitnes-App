import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { exerciseIconColor, Icon } from '@/components/Icon';
import { Button, Card, Divider, IconButton, ListRow, Screen, SectionHeader, StackHeader } from '@/components/ui';
import { allExercises, CATEGORY_LABEL, defaultMetric, getExercise, METRIC_LABEL, metricsFor } from '@/domain/exercises';
import type { Category, TrackerConfig } from '@/domain/types';
import { DEFAULT_TRACKERS } from '@/store/defaults';
import { useStore } from '@/store/store';
import { colors, space, type } from '@/theme';

const MAX = 8;

export default function TrackersScreen() {
  const { trackers, setTrackers } = useStore(useShallow((s) => ({ trackers: s.trackers, setTrackers: s.setTrackers })));

  const move = (i: number, d: -1 | 1) => {
    const next = [...trackers];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setTrackers(next);
  };
  const cycleMetric = (i: number) => {
    const t = trackers[i];
    const ms = metricsFor(getExercise(t.exerciseId).kind);
    const next: TrackerConfig = { ...t, metric: ms[(ms.indexOf(t.metric) + 1) % ms.length] };
    setTrackers(trackers.map((x, k) => (k === i ? next : x)));
  };
  const tracked = new Set(trackers.map((t) => t.exerciseId));

  return (
    <Screen header={<StackHeader title="Trackers on Today" />}>
      <Text style={[type.small, styles.lead]}>The first two sit beside your avatar. Tap a measure to switch it.</Text>
      <Card padded={false} style={styles.clip}>
        {trackers.map((t, i) => {
          const ex = getExercise(t.exerciseId);
          const multi = metricsFor(ex.kind).length > 1;
          return (
            <View key={`${t.exerciseId}-${i}`}>
              {i > 0 && <Divider inset={52} />}
              <View style={styles.row}>
                <Icon name={ex.icon} size={22} color={exerciseIconColor(ex.id)} />
                <View style={styles.flex}>
                  <Text style={type.body}>{ex.name}</Text>
                  <Text
                    style={[type.small, multi && styles.metricLink]}
                    onPress={multi ? () => cycleMetric(i) : undefined}
                    accessibilityRole={multi ? 'button' : undefined}
                    accessibilityLabel={multi ? `Measure: ${METRIC_LABEL[t.metric]}. Change` : undefined}>
                    {METRIC_LABEL[t.metric]}
                    {multi ? ' ⌄' : ''}
                  </Text>
                </View>
                <IconButton icon="chevron-up" label={`Move ${ex.name} up`} size={20} color={i === 0 ? colors.border : colors.textSecondary} onPress={() => move(i, -1)} />
                <IconButton icon="chevron-down" label={`Move ${ex.name} down`} size={20} color={i === trackers.length - 1 ? colors.border : colors.textSecondary} onPress={() => move(i, 1)} />
                <IconButton icon="close" label={`Remove ${ex.name}`} size={20} color={colors.textSecondary} onPress={() => setTrackers(trackers.filter((_, k) => k !== i))} />
              </View>
            </View>
          );
        })}
        {trackers.length === 0 && <Text style={[type.small, styles.pad]}>No trackers. Add some below.</Text>}
      </Card>

      {(['bodyweight', 'cardio', 'strength'] as Category[]).map((c) => {
        const options = allExercises().filter((e) => e.category === c && !tracked.has(e.id));
        if (!options.length) return null;
        return (
          <View key={c}>
            <SectionHeader title={`Add ${CATEGORY_LABEL[c].toLowerCase()}`} style={styles.section} />
            <Card padded={false} style={styles.clip}>
              {options.map((e, i) => (
                <View key={e.id}>
                  {i > 0 && <Divider inset={56} />}
                  <ListRow
                    icon={e.icon}
                    iconColor={exerciseIconColor(e.id)}
                    title={e.name}
                    chevron={false}
                    right={
                      trackers.length < MAX ? (
                        <Icon name="plus-circle-outline" size={22} color={colors.primary} />
                      ) : undefined
                    }
                    onPress={
                      trackers.length < MAX
                        ? () => setTrackers([...trackers, { exerciseId: e.id, metric: defaultMetric(e.kind) }])
                        : undefined
                    }
                  />
                </View>
              ))}
            </Card>
          </View>
        );
      })}
      <Button label="Reset to default" variant="secondary" compact onPress={() => setTrackers(DEFAULT_TRACKERS)} style={styles.section} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  lead: { marginBottom: space.md },
  clip: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.lg, paddingRight: space.xs, minHeight: 58 },
  metricLink: { color: colors.primary, fontWeight: '500' },
  pad: { padding: space.lg },
  section: { marginTop: space.xl },
});
