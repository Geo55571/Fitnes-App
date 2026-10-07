import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { goBack } from '@/components/nav';
import { showToast } from '@/components/toast';
import { Button, Card, Divider, Field, IconButton, Notice, Screen, StackHeader } from '@/components/ui';
import { DayBadge, haptic, MarkPicker, ReadingControl, WorkoutRow } from '@/components/winterArc/parts';
import { addDays, formatDayShort, formatMonthDay, formatRelativeDay } from '@/domain/dates';
import { arcDayNumber, isArcDay, MARK_LABEL, WINTER_ARC, type ArcMark, type ArcMarkEntry } from '@/domain/winterArc';
import { useUnits } from '@/hooks/today';
import { useWinterArc } from '@/hooks/winterArc';
import { useStore } from '@/store/store';
import { colors, space, type } from '@/theme';

/**
 * The daily check-in. Also the editor for any earlier day: every change is saved immediately and
 * the streaks, weeks and Discipline Score are recalculated from it.
 */
export default function ArcDayScreen() {
  const params = useLocalSearchParams<{ date: string }>();
  const { stats, today, data } = useWinterArc();
  const prefs = useUnits();
  const update = useStore((s) => s.updateArcDay);
  const setTrackFrom = useStore((s) => s.setArcTrackFrom);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(params.date)) ? String(params.date) : today;
  const info = stats.days.find((d) => d.date === date);
  const entry = info?.entry;
  const isToday = date === today;

  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const go = (d: string) => router.setParams({ date: d });
  const nav = (
    <>
      <IconButton icon="chevron-left" label="Previous day" onPress={() => go(prev)} color={isArcDay(prev) ? colors.text : colors.borderStrong} />
      <IconButton icon="chevron-right" label="Next day" onPress={() => next <= today && isArcDay(next) && go(next)} color={next <= today && isArcDay(next) ? colors.text : colors.borderStrong} />
    </>
  );
  const header = <StackHeader title={isToday ? 'Check-in' : 'Edit day'} right={nav} />;
  const relative = formatRelativeDay(date, today);

  if (!info || info.status === 'future') {
    return (
      <Screen header={header}>
        <Notice icon="calendar-blank-outline">
          {!isArcDay(date) ? 'This day isn’t part of the Winter Arc (Oct 1, 2026 – Feb 1, 2027).' : 'This day hasn’t come yet.'}
        </Notice>
      </Screen>
    );
  }
  if (!data.joinedAt) {
    return (
      <Screen header={header}>
        <Notice icon="snowflake">Join the Winter Arc to check in.</Notice>
        <Button label="Open Winter Arc" style={styles.block} onPress={() => router.replace('/winter-arc')} />
      </Screen>
    );
  }
  if (info.status === 'untracked') {
    return (
      <Screen header={header}>
        <Notice icon="calendar-blank-outline">
          {`You started counting on ${formatMonthDay(stats.trackFrom!)}. Count from ${formatMonthDay(date)} instead to fill in this day — days in between without a check-in will show as missed.`}
        </Notice>
        <Button
          label={`Count from ${formatMonthDay(date)}`}
          variant="secondary"
          style={styles.block}
          onPress={() => {
            setTrackFrom(date);
            showToast(`Counting from ${formatMonthDay(date)}`);
          }}
        />
      </Screen>
    );
  }

  const outcomes = Object.values(info.outcomes);
  const done = outcomes.filter((o) => o === 'done' || o === 'exception').length;
  const dayWorkouts = stats.workouts.filter((w) => w.date === date);
  const week = stats.weeks.find((w) => w.from <= date && w.to >= date)!;
  const setMark = (rule: 'nutrition' | 'discipline') => (mark: ArcMark | null) =>
    update(date, { [rule]: mark ? { mark, note: entry?.[rule]?.note } : undefined });
  const setNote = (rule: 'nutrition' | 'discipline') => (note: string) => {
    const cur = entry?.[rule];
    if (cur) update(date, { [rule]: { ...cur, note } });
  };
  const reading = entry?.reading ?? { minutes: 0 };

  const complete = () => {
    update(date, { checkedInAt: new Date().toISOString() });
    if (info.perfect) {
      haptic('success');
      const streak = stats.streaks.current;
      showToast(isToday ? `Perfect day. ${streak} day streak.` : `${formatMonthDay(date)} complete`);
    } else {
      showToast(isToday ? 'Check-in saved' : `${formatMonthDay(date)} saved`);
    }
    goBack();
  };

  return (
    <Screen header={header} footer={<Button label={isToday ? 'Complete check-in' : 'Done'} icon="check" onPress={complete} />}>
      <View style={styles.head}>
        <Text style={type.title} accessibilityRole="header">
          {relative}
        </Text>
        <Text style={styles.sub}>
          Day {arcDayNumber(date)} of {stats.totalDays}
          {relative === 'Yesterday' ? ` · ${formatDayShort(date)}` : ''}
        </Text>
        <DayBadge perfect={info.perfect} done={done} total={outcomes.length} style={styles.badge} />
      </View>

      <Section title="Nutrition">
        <MarkPicker value={entry?.nutrition?.mark} labels={MARK_LABEL.nutrition} onChange={setMark('nutrition')} accessibilityLabel="Nutrition" />
        <MarkNote key={`${date}-n`} value={entry?.nutrition} onChange={setNote('nutrition')} />
      </Section>

      <Section title="Reading" right={reading.exception ? 'Exception' : undefined}>
        {reading.exception ? (
          <Text style={type.small}>Approved exception — reading doesn’t count today.</Text>
        ) : (
          <ReadingControl minutes={reading.minutes} target={WINTER_ARC.readingMinutes} onChange={(minutes) => update(date, { reading: { ...reading, minutes } })} />
        )}
        <ReadingExtras
          key={date}
          book={reading.book}
          note={reading.note}
          exception={!!reading.exception}
          onChange={(p) => update(date, { reading: { ...reading, ...p } })}
        />
      </Section>

      <Section title="Discipline" caption="Private · never shared">
        <MarkPicker value={entry?.discipline?.mark} labels={MARK_LABEL.discipline} onChange={setMark('discipline')} accessibilityLabel="Discipline" />
        <MarkNote key={`${date}-d`} value={entry?.discipline} onChange={setNote('discipline')} />
      </Section>

      <Section title="Training" caption={week.weeklyApplies ? `This week: strength ${week.strength.count}/${week.strength.min} · endurance ${week.endurance.count}/${week.endurance.min}` : undefined} padded={false}>
        {dayWorkouts.map((w) => (
          <View key={w.sessionId}>
            <WorkoutRow workout={w} prefs={prefs} />
            <Divider inset={space.lg} />
          </View>
        ))}
        <View style={styles.trainPad}>
          <Button label="Add workout" icon="plus" variant="secondary" compact onPress={() => router.push({ pathname: '/winter-arc/workout', params: { date } })} />
        </View>
      </Section>
    </Screen>
  );
}

function Section({ title, caption, right, padded = true, children }: { title: string; caption?: string; right?: string; padded?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={type.section}>{title}</Text>
        {right ? <Text style={type.small}>{right}</Text> : caption ? <Text style={[type.caption, styles.caption]} numberOfLines={1}>{caption}</Text> : null}
      </View>
      <Card padded={padded} style={!padded && styles.clip}>
        {children}
      </Card>
    </View>
  );
}

/** "What happened?" for a broken rule, the reason for an exception. Optional, never required. */
function MarkNote({ value, onChange }: { value?: ArcMarkEntry; onChange: (note: string) => void }) {
  const [text, setText] = useState(value?.note ?? '');
  if (!value || value.mark === 'done') return null;
  return (
    <Field
      placeholder={value.mark === 'broken' ? 'What happened? (optional)' : 'Reason for the exception (optional)'}
      value={text}
      onChangeText={setText}
      onBlur={() => onChange(text)}
      onSubmitEditing={() => onChange(text)}
      returnKeyType="done"
      maxLength={280}
      style={styles.note}
    />
  );
}

function ReadingExtras({
  book,
  note,
  exception,
  onChange,
}: {
  book?: string;
  note?: string;
  exception: boolean;
  onChange: (p: { book?: string; note?: string; exception?: boolean }) => void;
}) {
  const [open, setOpen] = useState(!!(book || note));
  const [b, setB] = useState(book ?? '');
  const [n, setN] = useState(note ?? '');
  return (
    <View style={styles.extras}>
      {open ? (
        <>
          <Field label="Book" placeholder="Optional" value={b} onChangeText={setB} onBlur={() => onChange({ book: b })} maxLength={120} returnKeyType="done" />
          <Field
            label={exception ? 'Reason for the exception' : 'Note'}
            placeholder="Optional"
            value={n}
            onChangeText={setN}
            onBlur={() => onChange({ note: n })}
            maxLength={280}
            returnKeyType="done"
            style={styles.noteGap}
          />
        </>
      ) : null}
      <View style={styles.links}>
        {!open && (
          <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Add book or note</Text>
          </Pressable>
        )}
        <Pressable onPress={() => onChange({ exception: !exception })} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: exception }}>
          <Text style={styles.linkQuiet}>{exception ? 'Remove exception' : 'Approved exception'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: space.lg },
  clip: { overflow: 'hidden' },
  head: { marginTop: space.xs, marginBottom: space.md },
  sub: { fontSize: 16, color: colors.textSecondary, marginTop: 2 },
  badge: { marginTop: space.md },
  section: { marginTop: space.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, marginBottom: space.sm },
  caption: { flexShrink: 1, textAlign: 'right' },
  note: { marginTop: space.md },
  noteGap: { marginTop: space.md },
  extras: { marginTop: space.sm },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  linkQuiet: { fontSize: 13, fontWeight: '500', color: colors.textTertiary },
  trainPad: { padding: space.md, alignItems: 'flex-start' },
});
