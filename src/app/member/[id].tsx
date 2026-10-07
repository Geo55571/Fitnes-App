import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { exerciseIconColor, Icon } from '@/components/Icon';
import { SessionCard } from '@/components/SessionCard';
import { Card, Divider, EmptyState, Notice, PersonBadge, Screen, SectionHeader, Segmented, StackHeader, Tag } from '@/components/ui';
import { addDays, formatDayShort, formatMonthDay } from '@/domain/dates';
import { getExercise } from '@/domain/exercises';
import { challengeState, ME_ID, SHARING_LABEL, sessionsOf } from '@/domain/groups';
import { describeSets, entryValue, totalInRange } from '@/domain/metrics';
import type { DayKey, Session } from '@/domain/types';
import { formatDistance, formatDuration, formatMetricText, formatWeight, type UnitPrefs } from '@/domain/units';
import { useSelf } from '@/hooks/self';
import { useClock, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { colors, space, tabular, type } from '@/theme';

type View_ = 'today' | 'yesterday' | 'week';

function rangeFor(v: View_, today: DayKey): [DayKey, DayKey] {
  if (v === 'today') return [today, today];
  if (v === 'yesterday') return [addDays(today, -1), addDays(today, -1)];
  return [addDays(today, -6), today];
}

/** One line per exercise with the most meaningful total for its kind. */
function exerciseTotals(sessions: Session[], prefs: UnitPrefs) {
  const map = new Map<string, { reps: number; sets: number; top: number; dist: number; dur: number }>();
  for (const s of sessions) {
    for (const e of s.entries) {
      const t = map.get(e.exerciseId) ?? { reps: 0, sets: 0, top: 0, dist: 0, dur: 0 };
      const d = describeSets(e);
      t.reps += d.reps;
      t.sets += d.sets;
      t.top = Math.max(t.top, d.topWeightKg);
      t.dist += entryValue(e, 'distance');
      t.dur += entryValue(e, 'duration');
      map.set(e.exerciseId, t);
    }
  }
  return [...map.entries()].map(([id, t]) => {
    const kind = getExercise(id).kind;
    const value =
      kind === 'reps'
        ? `${t.reps} reps`
        : kind === 'duration'
          ? formatDuration(t.dur)
          : kind === 'distance'
            ? formatDistance(t.dist, prefs.distanceUnit)
            : `${t.sets} sets · top ${formatWeight(t.top, prefs.weightUnit)}`;
    return { id, value };
  });
}

export default function MemberProfile() {
  const { id, group: groupId } = useLocalSearchParams<{ id: string; group?: string }>();
  const { today, tz } = useClock();
  const prefs = useUnits();
  const me = useSelf();
  const { people, sessions, peopleSessions, groups, challengeTotals } = useStore(
    useShallow((s) => ({ people: s.people, sessions: s.sessions, peopleSessions: s.peopleSessions, groups: s.groups, challengeTotals: s.challengeTotals })),
  );
  const [view, setView] = useState<View_>('today');

  const person = id === ME_ID ? me : people.find((p) => p.id === id);
  const all = useMemo(() => (person ? sessionsOf(person.id, sessions, peopleSessions) : []), [person, sessions, peopleSessions]);

  if (!person) {
    return (
      <Screen header={<StackHeader title="Profile" />}>
        <EmptyState icon="account-circle-outline" title="Member not found" />
      </Screen>
    );
  }

  const self = person.id === ME_ID;
  const canSeeActivity = self || person.sharing === 'everything';
  const [start, end] = rangeFor(view, today);
  const inRange = all.filter((s) => s.date >= start && s.date <= end).sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const totals = exerciseTotals(inRange, prefs);

  // Challenges shared with this person (for "challenge results only" sharing).
  const shared = groups
    .filter((g) => g.memberIds.includes(person.id) && g.memberIds.includes(ME_ID) && (!groupId || g.id === groupId))
    .flatMap((g) => g.challenges.map((c) => ({ g, c })))
    .filter(({ c }) => challengeState(c, today) !== 'upcoming');

  const rangeLabel = view === 'week' ? `${formatMonthDay(start)} – ${formatMonthDay(end)}` : formatDayShort(start);

  return (
    <Screen header={<StackHeader title={self ? 'Your profile' : person.name} />}>
      <View style={styles.head}>
        <PersonBadge name={person.name} color={person.color} size={64} />
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {person.name}
            </Text>
            {person.source === 'demo' && <Tag label="Sample" />}
          </View>
          <Text style={type.small}>{SHARING_LABEL[person.sharing]}</Text>
        </View>
      </View>

      {self && (
        <View style={styles.block}>
          <Notice icon="shield-lock-outline">
            {person.sharing === 'everything'
              ? 'Group members can see this activity.'
              : person.sharing === 'challenges'
                ? 'Group members only see your challenge totals.'
                : 'Group members can’t see your activity.'}{' '}
            <Text style={styles.link} onPress={() => router.push('/settings')}>
              Privacy settings
            </Text>
          </Notice>
        </View>
      )}

      {canSeeActivity ? (
        <>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: 'week', label: 'Last week' },
            ]}
          />
          <SectionHeader title={rangeLabel} right={`${inRange.length} ${inRange.length === 1 ? 'session' : 'sessions'}`} style={styles.section} />
          {inRange.length === 0 ? (
            <Card>
              <EmptyState icon="calendar-blank-outline" title="No activity" body={view === 'week' ? 'Nothing logged in the last 7 days.' : 'Nothing logged on this day.'} />
            </Card>
          ) : (
            <>
              <Card padded={false} style={styles.clip}>
                {totals.map((t, i) => {
                  const ex = getExercise(t.id);
                  return (
                    <View key={t.id}>
                      {i > 0 && <Divider inset={56} />}
                      <View style={styles.totalRow}>
                        <Icon name={ex.icon} size={22} color={exerciseIconColor(ex.id)} />
                        <Text style={[type.body, styles.flex]}>{ex.name}</Text>
                        <Text style={[type.bodyStrong, tabular]}>{t.value}</Text>
                      </View>
                    </View>
                  );
                })}
              </Card>
              <SectionHeader title="Sessions" style={styles.section} />
              {inRange.map((s) => (
                <SessionCard key={s.id} session={s} prefs={prefs} tz={tz} today={today} showDate={view === 'week'} editable={self} />
              ))}
            </>
          )}
        </>
      ) : person.sharing === 'challenges' ? (
        <>
          <Notice icon="lock-outline">{person.name} shares challenge results only. Day-by-day activity isn’t visible.</Notice>
          <SectionHeader title="Challenge results" style={styles.section} />
          <Card padded={false} style={styles.clip}>
            {shared.length === 0 ? (
              <Text style={[type.small, styles.pad]}>No shared challenges yet.</Text>
            ) : (
              shared.map(({ g, c }, i) => (
                <View key={c.id}>
                  {i > 0 && <Divider inset={space.lg} />}
                  <View style={styles.totalRow}>
                    <View style={styles.flex}>
                      <Text style={type.body}>{c.title}</Text>
                      <Text style={type.caption}>
                        {g.name} · {formatMonthDay(c.startDate)} – {formatMonthDay(c.endDate)}
                      </Text>
                    </View>
                    <Text style={[type.bodyStrong, tabular]}>
                      {person.source === 'remote'
                        ? challengeTotals[c.id]?.[person.id] !== undefined
                          ? formatMetricText(challengeTotals[c.id][person.id], c.metric, prefs)
                          : 'Hidden'
                        : formatMetricText(totalInRange(all, c.startDate, c.endDate, c.exerciseId, c.metric), c.metric, prefs)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      ) : (
        <Notice icon="lock-outline">{person.name} keeps their activity private.</Notice>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.sm, marginBottom: space.xl },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontSize: 24, fontWeight: '700', color: colors.text, letterSpacing: -0.4, flexShrink: 1 },
  block: { marginBottom: space.lg },
  link: { color: colors.primary, fontWeight: '600' },
  section: { marginTop: space.xl },
  clip: { overflow: 'hidden' },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 13 },
  pad: { padding: space.lg },
});
