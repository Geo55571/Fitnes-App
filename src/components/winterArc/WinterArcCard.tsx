import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useWinterArc } from '@/hooks/winterArc';
import { colors, radius, space, tabular, type } from '@/theme';

import { Icon } from '../Icon';
import { Button } from '../ui';

/**
 * Winter Arc's way into the app: a quiet row on Today (once joined) and on Groups (to join).
 * Only the day, the streak and whether today is checked in — the details live in the challenge.
 */
export function WinterArcCard({ style, invite }: { style?: StyleProp<ViewStyle>; invite?: boolean }) {
  const { stats, joined } = useWinterArc();
  if (!joined && !invite) return null;
  if (!joined && stats.phase === 'finished') return null;

  const day = stats.today;
  const doneToday = !!day?.perfect;
  const subtitle = !joined
    ? `Personal challenge · Oct 1 – Feb 1${stats.phase === 'upcoming' ? ` · starts in ${stats.daysToStart} days` : ''}`
    : stats.phase === 'upcoming'
      ? `Starts in ${stats.daysToStart} ${stats.daysToStart === 1 ? 'day' : 'days'}`
      : stats.phase === 'finished'
        ? `Complete · ${stats.perfectDays} perfect days`
        : `Day ${stats.dayNumber} of ${stats.totalDays} · ${stats.streaks.current} day streak`;

  return (
    <Pressable
      onPress={() => router.push('/winter-arc')}
      accessibilityRole="button"
      accessibilityLabel={`Winter Arc. ${subtitle}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
      <View style={styles.icon}>
        <Icon name="snowflake" size={22} color={colors.onPrimary} />
      </View>
      <View style={styles.body}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {joined ? 'Winter Arc' : 'Winter Arc 2026/27'}
        </Text>
        <Text style={[type.small, tabular]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {!joined ? (
        <Text style={styles.join}>Join</Text>
      ) : day && stats.phase === 'active' ? (
        doneToday ? (
          <Icon name="check-circle" size={26} color={colors.primary} />
        ) : (
          <Button label="Check in" compact onPress={() => router.push('/winter-arc')} style={styles.btn} />
        )
      ) : (
        <Icon name="chevron-right" size={22} color={colors.textTertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    paddingLeft: space.md,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 1 },
  join: { fontSize: 15, fontWeight: '600', color: colors.primary, paddingHorizontal: space.sm },
  btn: { height: 36 },
});
