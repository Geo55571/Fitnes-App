import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { formatClock, formatRelativeDay } from '@/domain/dates';
import { describeEntry } from '@/domain/describe';
import { CATEGORY_LABEL, getExercise } from '@/domain/exercises';
import type { DayKey, Session } from '@/domain/types';
import type { UnitPrefs } from '@/domain/units';
import { useStore } from '@/store/store';
import { colors, radius, space, type } from '@/theme';

import { confirmAction } from './confirm';
import { exerciseIconColor, Icon } from './Icon';
import { showToast } from './toast';
import { IconButton, Tag } from './ui';

interface Props {
  session: Session;
  prefs: UnitPrefs;
  tz: string;
  today: DayKey;
  showDate?: boolean;
  /** Only this device's own sessions can be edited. */
  editable?: boolean;
  /** Limit the entries shown (e.g. to one exercise in Progress). */
  onlyExerciseId?: string;
}

export function SessionCard({ session, prefs, tz, today, showDate, editable = true, onlyExerciseId }: Props) {
  const deleteSession = useStore((s) => s.deleteSession);
  const entries = onlyExerciseId ? session.entries.filter((e) => e.exerciseId === onlyExerciseId) : session.entries;
  const heading = showDate
    ? `${formatRelativeDay(session.date, today)} · ${CATEGORY_LABEL[session.category]}`
    : `${CATEGORY_LABEL[session.category]} · ${formatClock(session.performedAt, tz)}`;

  return (
    <View style={styles.card}>
      <View style={[styles.head, !editable && styles.headPlain]}>
        <Text style={[type.small, styles.flex]} numberOfLines={1}>
          {heading}
        </Text>
        {session.demo && <Tag label="Sample" />}
        {editable && (
          <>
            <IconButton
              icon="pencil-outline"
              label="Edit session"
              size={19}
              color={colors.textSecondary}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
            />
            <IconButton
              icon="trash-can-outline"
              label="Delete session"
              size={19}
              color={colors.textSecondary}
              onPress={() =>
                confirmAction('Delete session?', 'This removes it from your history, goals and challenges.', 'Delete', () => {
                  deleteSession(session.id);
                  showToast('Session deleted');
                })
              }
            />
          </>
        )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingBottom: space.md,
    marginBottom: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
  // Without the edit buttons, keep the tag off the card's edge.
  headPlain: { paddingRight: space.md },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4, paddingRight: space.md },
  name: { flexShrink: 0, maxWidth: '45%' },
  desc: { flex: 1, textAlign: 'right', color: colors.textSecondary },
});
