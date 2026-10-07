import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatClock, formatRelativeDay } from '@/domain/dates';
import { describeEntry } from '@/domain/describe';
import { CATEGORY_LABEL, getExercise } from '@/domain/exercises';
import type { DayKey, Session } from '@/domain/types';
import type { UnitPrefs } from '@/domain/units';
import { colors, radius, space, type } from '@/theme';

import { exerciseIconColor, Icon } from './Icon';
import { Tag } from './ui';

interface Props {
  session: Session;
  prefs: UnitPrefs;
  tz: string;
  today: DayKey;
  showDate?: boolean;
  /** Only this device's own sessions can be edited: tapping one opens it (edit or delete there). */
  editable?: boolean;
  /** Limit the entries shown (e.g. to one exercise in Progress). */
  onlyExerciseId?: string;
}

export function SessionCard({ session, prefs, tz, today, showDate, editable = true, onlyExerciseId }: Props) {
  const entries = onlyExerciseId ? session.entries.filter((e) => e.exerciseId === onlyExerciseId) : session.entries;
  const heading = showDate
    ? `${formatRelativeDay(session.date, today)} · ${CATEGORY_LABEL[session.category]}`
    : `${CATEGORY_LABEL[session.category]} · ${formatClock(session.performedAt, tz)}`;

  const body = (
    <>
      <View style={styles.head}>
        <Text style={[type.small, styles.flex]} numberOfLines={1}>
          {heading}
        </Text>
        {session.demo && <Tag label="Sample" />}
        {editable && <Icon name="chevron-right" size={18} color={colors.textTertiary} />}
      </View>
      {entries.map((e) => {
        const ex = getExercise(e.exerciseId);
        return (
          <View key={e.id} style={styles.entry}>
            <Icon name={ex.icon} size={20} color={exerciseIconColor(ex.id)} />
            <Text style={[type.bodyStrong, styles.name]} numberOfLines={1}>
              {ex.name}
            </Text>
            <Text style={[type.body, styles.desc]} numberOfLines={2}>
              {describeEntry(e, prefs)}
            </Text>
          </View>
        );
      })}
    </>
  );
  if (!editable) return <View style={styles.card}>{body}</View>;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${heading}. Open to edit or delete`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    marginBottom: space.sm,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 40 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 },
  name: { flexShrink: 0, maxWidth: '45%' },
  desc: { flex: 1, textAlign: 'right', color: colors.textSecondary },
});
