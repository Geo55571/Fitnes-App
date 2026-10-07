import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ME_ID, type LeaderRow } from '@/domain/groups';
import type { Metric } from '@/domain/types';
import { formatMetricText, type UnitPrefs } from '@/domain/units';
import { colors, radius, space, tabular, type } from '@/theme';

import { PersonBadge } from './ui';

interface Props {
  rows: LeaderRow[];
  metric: Metric;
  prefs: UnitPrefs;
  groupId: string;
  limit?: number;
}

export function Leaderboard({ rows, metric, prefs, groupId, limit }: Props) {
  // Always keep the local user visible even when the list is truncated.
  let shown = limit ? rows.slice(0, limit) : rows;
  const me = rows.find((r) => r.person.id === ME_ID);
  if (me && !shown.includes(me)) shown = [...shown.slice(0, Math.max(0, (limit ?? 1) - 1)), me];

  return (
    <View style={styles.list}>
      {shown.map((r) => {
        const self = r.person.id === ME_ID;
        return (
          <Pressable
            key={r.person.id}
            onPress={() => router.push({ pathname: '/member/[id]', params: { id: r.person.id, group: groupId } })}
            accessibilityRole="button"
            accessibilityLabel={`${r.rank ? `Rank ${r.rank}, ` : ''}${self ? 'You' : r.person.name}, ${r.value === null ? 'private' : formatMetricText(r.value, metric, prefs)}`}
            style={({ pressed }) => [styles.row, self && styles.me, pressed && styles.pressed]}>
            <Text style={[styles.rank, tabular]}>{r.rank ?? '–'}</Text>
            <PersonBadge name={r.person.name} color={r.person.color} size={38} />
            <View style={styles.flex}>
              <Text style={type.body} numberOfLines={1}>
                {self ? 'You' : r.person.name}
              </Text>
              {self && r.visibleToOthers === false ? <Text style={type.caption}>Hidden from others</Text> : null}
              {r.person.source === 'demo' ? <Text style={type.caption}>Sample</Text> : null}
            </View>
            <Text style={[r.value === null ? styles.private : styles.value, tabular]}>
              {r.value === null ? 'Private' : formatMetricText(r.value, metric, prefs)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  me: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.75 },
  rank: { width: 18, fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  value: { fontSize: 16, fontWeight: '600', color: colors.text },
  private: { fontSize: 14, color: colors.textTertiary },
});
