import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Divider, Field, IconButton, Notice, Screen, Sheet, StackHeader, Tag } from '@/components/ui';
import { DAY_COLOR, DAY_LABEL, StatusRow, WeekBlocks, WorkoutRow } from '@/components/winterArc/parts';
import { addDays, formatDayShort, formatMonthDay, startOfWeek, WEEKDAY_LETTER, weekday } from '@/domain/dates';
import { arcWeekStarts, RULE_LABEL, type ArcWeeklyRule, type WeeklyProgress } from '@/domain/winterArc';
import { useUnits } from '@/hooks/today';
import { useWinterArc } from '@/hooks/winterArc';
import { useStore } from '@/store/store';
import { colors, radius, space, tabular, type } from '@/theme';

/** One calendar week: are the weekly minimums met, and how did each day go. */
export default function ArcWeekScreen() {
  const params = useLocalSearchParams<{ start?: string }>();
  const { stats, today } = useWinterArc();
  const prefs = useUnits();
  const setException = useStore((s) => s.setArcWeekException);
  const [excepting, setExcepting] = useState<ArcWeeklyRule | null>(null);
  const [reason, setReason] = useState('');

  const starts = arcWeekStarts();
  const wanted = params.start ? startOfWeek(params.start) : startOfWeek(today);
  const start = starts.includes(wanted) ? wanted : wanted < starts[0] ? starts[0] : starts[starts.length - 1];
  const week = stats.weeks.find((w) => w.start === start)!;
  const i = starts.indexOf(start);
  const go = (s: string | undefined) => s && router.setParams({ start: s });

  return (
    <Screen
      header={
        <StackHeader
          title="Week"
          right={
            <>
              <IconButton icon="chevron-left" label="Previous week" onPress={() => go(starts[i - 1])} color={i > 0 ? colors.text : colors.borderStrong} />
              <IconButton icon="chevron-right" label="Next week" onPress={() => go(starts[i + 1])} color={i < starts.length - 1 ? colors.text : colors.borderStrong} />
            </>
          }
        />
      }>
      <View style={styles.head}>
        <Text style={styles.kicker}>
          {formatMonthDay(week.from)} – {formatMonthDay(week.to)}
        </Text>
        <Text style={type.title} accessibilityRole="header">
          Week {week.index}
        </Text>
        <Text style={[type.body, styles.verdict]}>{verdict(week, today)}</Text>
      </View>

      <DayStrip week={week} />

      {week.weeklyApplies ? (
        (['strength', 'endurance'] as const).map((rule) => {
          const r = week[rule];
          return (
            <Card key={rule} padded={false} style={styles.block}>
              <View style={styles.pad}>
                <View style={styles.ruleHead}>
                  <Text style={type.section}>{RULE_LABEL[rule]}</Text>
                  <Text style={[type.bodyStrong, tabular]}>
                    {r.count}/{r.max}
                  </Text>
                </View>
                <WeekBlocks count={r.count} min={r.min} max={r.max} />
                <View style={styles.minRow}>
                  <Text style={type.small}>
                    Minimum requirement: {r.min} {r.met ? '✓' : r.excepted ? '· exception' : ''}
                  </Text>
                  {r.count > r.max && <Tag label="Over the maximum" tone="coral" />}
                </View>
                {r.excepted && r.exceptionNote ? <Text style={[type.small, styles.noteText]}>“{r.exceptionNote}”</Text> : null}
              </View>
              {r.workouts.map((w) => (
                <View key={w.sessionId}>
                  <Divider inset={space.lg} />
                  <WorkoutRow workout={w} prefs={prefs} showDate dateLabel={formatDayShort(w.date)} />
                </View>
              ))}
              {!r.met && week.state !== 'future' && (
                <>
                  <Divider />
                  <View style={styles.actions}>
                    <Button
                      label="Add workout"
                      icon="plus"
                      compact
                      variant="secondary"
                      onPress={() => router.push({ pathname: '/winter-arc/workout', params: { kind: rule, date: week.to < today ? week.to : today } })}
                    />
                    <Pressable
                      onPress={() => {
                        if (r.excepted) setException(week.start, rule, null);
                        else {
                          setReason('');
                          setExcepting(rule);
                        }
                      }}
                      hitSlop={8}
                      accessibilityRole="button">
                      <Text style={styles.quiet}>{r.excepted ? 'Remove exception' : 'Approved exception'}</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </Card>
          );
        })
      ) : (
        <View style={styles.block}>
          <Notice icon="information-outline">
            Weekly minimums apply to weeks with at least 4 tracked challenge days. This week has {week.trackedDays}.
          </Notice>
        </View>
      )}

      <Card style={styles.block}>
        <StatusRow label="Reading" value={`${week.reading.done}/${week.reading.due} days`} outcome={tallyOutcome(week.reading)} />
        <Divider />
        <StatusRow label="Nutrition" value={`${week.nutrition.done}/${week.nutrition.due} clean`} outcome={tallyOutcome(week.nutrition)} />
        <Divider />
        <StatusRow label="Discipline" value={`${week.discipline.done}/${week.discipline.due}`} outcome={tallyOutcome(week.discipline)} />
      </Card>

      <Sheet visible={!!excepting} onClose={() => setExcepting(null)} title="Approved exception">
        <Text style={type.small}>
          For when the other participants agreed beforehand that the {excepting ? RULE_LABEL[excepting].toLowerCase() : ''} minimum doesn’t apply this week. It’s
          recorded as an exception, not as a miss.
        </Text>
        <Field label="Reason" placeholder="Optional" value={reason} onChangeText={setReason} maxLength={280} style={styles.sheetField} />
        <Button
          label="Save exception"
          style={styles.sheetBtn}
          onPress={() => {
            if (excepting) setException(week.start, excepting, { note: reason });
            setExcepting(null);
          }}
        />
      </Sheet>
    </Screen>
  );
}

function tallyOutcome(t: { done: number; due: number }) {
  if (!t.due) return 'open' as const;
  return t.done === t.due ? ('met' as const) : ('partial' as const);
}

function verdict(w: WeeklyProgress, today: string): string {
  if (w.state === 'future') return 'Hasn’t started yet.';
  if (w.state === 'untracked') return 'Before you started counting.';
  if (w.state === 'complete') return 'Perfect week. Every rule, every day.';
  const missing: string[] = [];
  if (w.weeklyApplies) {
    for (const rule of ['strength', 'endurance'] as const) {
      const r = w[rule];
      const left = r.min - r.count;
      if (left > 0 && !r.excepted) missing.push(`${left} ${rule} ${left === 1 ? 'workout' : 'workouts'}`);
    }
  }
  const imperfect = w.days.filter((d) => d.date < today && !d.perfect && !d.allExcepted && d.status !== 'untracked').length;
  const days = `${imperfect} imperfect ${imperfect === 1 ? 'day' : 'days'}`;
  if (w.state === 'incomplete') return missing.length ? `Finished — ${missing.join(' and ')} short.` : `Finished with ${days}.`;
  if (missing.length) return `Add ${missing.join(' and ')} by ${formatDayShort(w.to)} to meet the minimums.`;
  return imperfect ? `Weekly minimums met · ${days} so far.` : 'On track. Weekly minimums met.';
}

function DayStrip({ week }: { week: WeeklyProgress }) {
  return (
    <View style={styles.strip}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(week.start, i);
        const info = week.days.find((x) => x.date === d);
        const empty = !info || info.status === 'future' || info.status === 'open' || info.status === 'untracked';
        const dark = info?.status === 'perfect' || info?.status === 'failed';
        return (
          <Pressable
            key={d}
            disabled={!info || info.status === 'future'}
            onPress={() => router.push({ pathname: '/winter-arc/day/[date]', params: { date: d } })}
            accessibilityRole="button"
            accessibilityLabel={`${formatDayShort(d)}${info ? `, ${DAY_LABEL[info.status]}` : ''}`}
            style={styles.stripItem}>
            <Text style={styles.stripHead}>{WEEKDAY_LETTER[weekday(d)]}</Text>
            <View style={[styles.stripCell, empty ? styles.stripEmpty : { backgroundColor: DAY_COLOR[info!.status] }, !info && styles.stripOutside]}>
              <Text style={[styles.stripNum, tabular, dark && styles.stripNumDark]}>{Number(d.slice(8))}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: space.xs, marginBottom: space.md, gap: 2 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.textSecondary, textTransform: 'uppercase' },
  verdict: { color: colors.textSecondary, marginTop: 2 },
  block: { marginTop: space.lg, overflow: 'hidden' },
  pad: { padding: space.lg, gap: space.sm },
  ruleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  minRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteText: { fontStyle: 'italic' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, paddingLeft: space.lg },
  quiet: { fontSize: 13, fontWeight: '500', color: colors.textTertiary },
  strip: { flexDirection: 'row', gap: 6 },
  stripItem: { flex: 1, alignItems: 'center', gap: 4 },
  stripHead: { fontSize: 12, color: colors.textTertiary, fontWeight: '500' },
  stripCell: { width: '100%', aspectRatio: 1, maxWidth: 52, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  stripEmpty: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  stripOutside: { opacity: 0.35 },
  stripNum: { fontSize: 14, fontWeight: '600', color: colors.text },
  stripNumDark: { color: colors.onPrimary },
  sheetField: { marginTop: space.lg },
  sheetBtn: { marginTop: space.lg },
});
