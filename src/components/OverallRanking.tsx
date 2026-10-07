import { StyleSheet, Text, View } from 'react-native';

import { ME_ID } from '@/domain/groups';
import type { OverallRow } from '@/domain/rating';
import { colors, radius, space, type } from '@/theme';

import { Icon } from './Icon';
import { Card, PersonBadge } from './ui';

const MEDAL = ['#E0A100', '#9AA3AD', '#B87333'];

/** The main challenge: everyone across your groups by overall rating (0–100). */
export function OverallRanking({ rows, style }: { rows: OverallRow[]; style?: object }) {
  const mine = rows.find((r) => r.person.id === ME_ID);
  return (
    <Card style={[styles.card, style]}>
      <View style={styles.head}>
        <View style={styles.trophy}>
          <Icon name="trophy" size={22} color="#E0A100" />
        </View>
        <View style={styles.flex}>
          <Text style={type.section}>Main challenge</Text>
          <Text style={type.small}>Overall rating from all your challenges · 0–100</Text>
        </View>
        {mine && (
          <View style={styles.mine} accessibilityLabel={`Your rating ${mine.rating}, rank ${mine.rank}`}>
            <Text style={styles.mineValue}>{mine.rating}</Text>
            <Text style={styles.mineLabel}>#{mine.rank}</Text>
          </View>
        )}
      </View>
      {rows.length === 0 ? (
        <Text style={[type.small, styles.empty]}>
          Start a challenge in a group: the leader of each challenge scores 100, everyone else their share — and your overall
          rating is the average.
        </Text>
      ) : (
        rows.slice(0, 10).map((r) => {
          const self = r.person.id === ME_ID;
          return (
            <View key={r.person.id} style={[styles.row, self && styles.rowMe]}>
              <View style={[styles.rank, r.rank <= 3 && { backgroundColor: MEDAL[r.rank - 1] }]}>
                <Text style={[styles.rankText, r.rank <= 3 && styles.rankTop]}>{r.rank}</Text>
              </View>
              <PersonBadge name={r.person.name} color={r.person.color} size={30} />
              <View style={styles.flex}>
                <Text style={[type.bodyStrong, styles.name]} numberOfLines={1}>
                  {self ? `${r.person.name} (you)` : r.person.name}
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(2, r.rating)}%` }, self && styles.fillMe]} />
                </View>
              </View>
              <Text style={styles.value}>{r.rating}</Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  trophy: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(224,161,0,0.14)', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  mine: { alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.md, backgroundColor: colors.primary },
  mineValue: { fontSize: 22, fontWeight: '800', color: colors.onPrimary, lineHeight: 26 },
  mineLabel: { fontSize: 11, fontWeight: '600', color: colors.onPrimary, opacity: 0.85 },
  empty: { marginTop: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6, paddingHorizontal: space.xs, borderRadius: radius.md },
  rowMe: { backgroundColor: colors.surfaceMuted },
  rank: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  rankText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  rankTop: { color: '#fff' },
  name: { fontSize: 15 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, marginTop: 4, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.textTertiary },
  fillMe: { backgroundColor: colors.primary },
  value: { fontSize: 18, fontWeight: '800', color: colors.text, minWidth: 34, textAlign: 'right' },
});
