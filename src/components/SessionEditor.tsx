import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, formatRelativeDay } from '@/domain/dates';
import { describeStats } from '@/domain/describe';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  defaultKindFor,
  exercisesIn,
  getExercise,
  KIND_LABEL,
  MUSCLE_LABEL,
  MUSCLES,
  type Exercise,
  type Muscle,
} from '@/domain/exercises';
import { exercisesUsed } from '@/domain/metrics';
import type { Category, DayKey, Entry, ExerciseKind, Session } from '@/domain/types';
import {
  distanceToMeters,
  formatPaceOrSpeed,
  kgToWeight,
  metersToDistance,
  parseDecimal,
  parseInteger,
  trimNumber,
  weightToKg,
  type UnitPrefs,
} from '@/domain/units';
import { newId } from '@/store/ids';
import { useStore, type SessionInput } from '@/store/store';
import { colors, radius, space, tabular, type } from '@/theme';

import { confirmAction } from './confirm';
import { exerciseIconColor, Icon } from './Icon';
import { RestChips, Stopwatch } from './timers';
import { showToast } from './toast';
import { Button, Chip, ChipRow, Field, IconButton, NumberCell, Segmented, Sheet } from './ui';

// ---------- draft model (strings while editing; canonical numbers on save) ----------

interface SetDraft {
  key: string;
  reps: string;
  weight: string;
  /** Original canonical weight, reused verbatim if the text wasn't edited (avoids unit round-trip drift). */
  origKg?: number;
  origText?: string;
}

interface BlockDraft {
  key: string;
  exerciseId: string;
  sets: SetDraft[];
  distance: string;
  origM?: number;
  origDistText?: string;
  durMin: string;
  durSec: string;
  /** Watch readings from a scanned photo; kept as-is through edits. */
  stats?: Entry['stats'];
}

type Drafts = Record<Category, BlockDraft[]>;

const blankSet = (): SetDraft => ({ key: newId(), reps: '', weight: '' });

function weightText(kg: number, prefs: UnitPrefs) {
  return trimNumber(kgToWeight(kg, prefs.weightUnit), 2);
}

function lastEntryFor(sessions: Session[], exerciseId: string): Entry | undefined {
  let best: { at: string; e: Entry } | undefined;
  for (const s of sessions) {
    for (const e of s.entries) {
      if (e.exerciseId === exerciseId && (!best || s.performedAt > best.at)) best = { at: s.performedAt, e };
    }
  }
  return best?.e;
}

function blockFromEntry(entry: Entry, prefs: UnitPrefs, keepSets = true): BlockDraft {
  const dist = entry.distanceM !== undefined ? trimNumber(metersToDistance(entry.distanceM, prefs.distanceUnit), 2) : '';
  const dur = entry.durationSec ?? 0;
  return {
    key: newId(),
    exerciseId: entry.exerciseId,
    sets: keepSets && entry.sets?.length
      ? entry.sets.map((s) => {
          const w = s.weightKg !== undefined ? weightText(s.weightKg, prefs) : '';
          return { key: newId(), reps: String(s.reps), weight: w, origKg: s.weightKg, origText: w };
        })
      : [blankSet()],
    distance: dist,
    origM: entry.distanceM,
    origDistText: dist,
    durMin: dur ? String(Math.floor(dur / 60)) : '',
    durSec: dur ? String(dur % 60) : '',
    stats: entry.stats,
  };
}

function newBlock(exerciseId: string, sessions: Session[], prefs: UnitPrefs): BlockDraft {
  const ex = getExercise(exerciseId);
  // Strength: start from the last workout's sets — the fastest path for repeat lifts.
  if (ex.kind === 'strength') {
    const last = lastEntryFor(sessions, exerciseId);
    if (last?.sets?.length) return blockFromEntry({ ...last, distanceM: undefined, durationSec: undefined }, prefs);
  }
  return { key: newId(), exerciseId, sets: [blankSet()], distance: '', durMin: '', durSec: '' };
}

const DEFAULT_EXERCISE: Record<Category, string> = { strength: 'bench', cardio: 'running', bodyweight: 'pushups' };

// ---------- validation ----------

type Errors = Record<string, string>;

const stats = (b: BlockDraft) => (b.stats ? { stats: b.stats } : {});

/** Plank-style holds vs. timed workouts (HIIT, yoga, gym sessions) — different words and presets. */
const isHold = (ex: { id: string; category: Category; custom?: boolean }) => ex.id === 'plank' || (!!ex.custom && ex.category === 'bodyweight');

function buildEntries(blocks: BlockDraft[], prefs: UnitPrefs): { entries: Omit<Entry, 'id'>[]; errors: Errors } {
  const errors: Errors = {};
  const entries: Omit<Entry, 'id'>[] = [];

  const parseDuration = (b: BlockDraft, required: boolean): number | undefined | null => {
    const minT = b.durMin.trim();
    const secT = b.durSec.trim();
    if (!minT && !secT) {
      if (required) errors[`${b.key}:dur`] = 'Enter a duration';
      return required ? null : undefined;
    }
    const min = minT ? parseInteger(minT) : 0;
    const sec = secT ? parseInteger(secT) : 0;
    if (Number.isNaN(min) || Number.isNaN(sec) || sec > 59 || min * 60 + sec <= 0) {
      errors[`${b.key}:dur`] = 'Use minutes and seconds (0–59)';
      return null;
    }
    return min * 60 + sec;
  };

  for (const b of blocks) {
    const ex = getExercise(b.exerciseId);
    if (ex.kind === 'strength' || ex.kind === 'reps') {
      const rows = b.sets.filter((s) => s.reps.trim() || s.weight.trim());
      if (!rows.length) {
        errors[`${b.key}:empty`] = 'Enter at least one set';
        continue;
      }
      const sets = rows.map((s) => {
        const reps = parseInteger(s.reps);
        if (Number.isNaN(reps) || reps < 1 || reps > 9999) errors[`${b.key}:${s.key}:reps`] = 'reps';
        let weightKg: number | undefined;
        if (ex.kind === 'strength') {
          const w = parseDecimal(s.weight);
          if (Number.isNaN(w) || w > 2000) errors[`${b.key}:${s.key}:weight`] = 'weight';
          weightKg = s.origKg !== undefined && s.weight === s.origText ? s.origKg : weightToKg(w, prefs.weightUnit);
        }
        return ex.kind === 'strength' ? { reps, weightKg } : { reps };
      });
      entries.push({ exerciseId: b.exerciseId, sets });
    } else if (ex.kind === 'duration') {
      const d = parseDuration(b, true);
      if (d) entries.push({ exerciseId: b.exerciseId, durationSec: d, ...stats(b) });
    } else {
      // Distance, or just a time (indoor bike, treadmill without distance).
      const d = parseDuration(b, false);
      const blank = !b.distance.trim();
      if (blank && d) {
        entries.push({ exerciseId: b.exerciseId, durationSec: d, ...stats(b) });
        continue;
      }
      const v = parseDecimal(b.distance);
      if (Number.isNaN(v) || v <= 0 || v > 1000) errors[`${b.key}:dist`] = blank ? 'Enter a distance or a time' : 'Enter a distance';
      const distanceM = b.origM !== undefined && b.distance === b.origDistText ? b.origM : distanceToMeters(v, prefs.distanceUnit);
      if (!errors[`${b.key}:dist`] && d !== null) {
        entries.push({ exerciseId: b.exerciseId, distanceM, ...(d ? { durationSec: d } : {}), ...stats(b) });
      }
    }
  }
  if (!blocks.length) errors.form = 'Add an exercise';
  return { entries, errors };
}

// ---------- component ----------

interface Props {
  prefs: UnitPrefs;
  sessions: Session[];
  today: DayKey;
  date: DayKey;
  onDateChange: (d: DayKey) => void;
  /** Present when editing an existing session. */
  session?: Session;
  initialCategory?: Category;
  initialExerciseId?: string;
  saveLabel: string;
  onSave: (input: SessionInput) => void;
}

export function SessionEditor({
  prefs,
  sessions,
  today,
  date,
  onDateChange,
  session,
  initialCategory,
  initialExerciseId,
  saveLabel,
  onSave,
}: Props) {
  const [category, setCategory] = useState<Category>(session?.category ?? initialCategory ?? 'strength');
  const [drafts, setDrafts] = useState<Drafts>(() => {
    const init: Drafts = { strength: [], cardio: [], bodyweight: [] };
    if (session) {
      init[session.category] = session.entries.map((e) => blockFromEntry(e, prefs));
    }
    (Object.keys(init) as Category[]).forEach((c) => {
      if (init[c].length) return;
      const preset = initialExerciseId && getExercise(initialExerciseId).category === c ? initialExerciseId : undefined;
      init[c] = [newBlock(preset ?? recentIn(c, sessions)[0] ?? DEFAULT_EXERCISE[c], sessions, prefs)];
    });
    return init;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'replace'; blockKey: string } | null>(null);
  const [creating, setCreating] = useState<{ name: string; kind: ExerciseKind; muscles: Muscle[] } | null>(null);
  const [routineName, setRoutineName] = useState<string | null>(null);
  const { routines, saveRoutine, deleteRoutine, addCustomExercise } = useStore(
    useShallow((s) => ({
      routines: s.routines,
      saveRoutine: s.saveRoutine,
      deleteRoutine: s.deleteRoutine,
      addCustomExercise: s.addCustomExercise,
      // Re-render when custom exercises change so the picker lists them.
      customExercises: s.customExercises,
    })),
  );

  const blocks = drafts[category];
  const setBlocks = (fn: (b: BlockDraft[]) => BlockDraft[]) => setDrafts((d) => ({ ...d, [category]: fn(d[category]) }));
  const updateBlock = (key: string, patch: Partial<BlockDraft>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const updateSet = (bKey: string, sKey: string, patch: Partial<SetDraft>) =>
    setBlocks((bs) =>
      bs.map((b) => (b.key === bKey ? { ...b, sets: b.sets.map((s) => (s.key === sKey ? { ...s, ...patch } : s)) } : b)),
    );

  const recent = useMemo(() => {
    const used = new Set(blocks.map((b) => b.exerciseId));
    return recentIn(category, sessions).concat(exercisesIn(category).map((e) => e.id))
      .filter((id, i, arr) => arr.indexOf(id) === i && !used.has(id))
      .slice(0, 4);
  }, [blocks, category, sessions]);

  const save = () => {
    const { entries, errors: errs } = buildEntries(blocks, prefs);
    setErrors(errs);
    if (Object.keys(errs).length || !entries.length) return;
    onSave({ date, category, entries });
  };

  // Quick starts: repeat the latest session of this category, or load a saved routine.
  const lastSession = useMemo(
    () =>
      sessions
        .filter((s) => s.category === category && s.id !== session?.id)
        .reduce<Session | undefined>((a, b) => (!a || b.performedAt > a.performedAt ? b : a), undefined),
    [sessions, category, session?.id],
  );
  const categoryRoutines = routines.filter((r) => r.category === category);
  const loadEntries = (entries: Omit<Entry, 'id'>[]) => {
    setBlocks(() => entries.map(({ stats: _stats, ...e }) => blockFromEntry({ ...e, id: 'tmp' }, prefs)));
    setErrors({});
  };

  const confirmRoutine = () => {
    const name = (routineName ?? '').trim();
    if (!name) return;
    const { entries, errors: errs } = buildEntries(blocks, prefs);
    setErrors(errs);
    if (Object.keys(errs).length || !entries.length) {
      setRoutineName(null);
      return showToast('Fill in the exercises first, then save them as a routine.');
    }
    saveRoutine({ name, category, entries });
    setRoutineName(null);
    showToast(`Routine saved: ${name}`);
  };

  const createExercise = () => {
    if (!creating || !creating.name.trim()) return;
    const ex = addCustomExercise({ name: creating.name, category, kind: creating.kind, muscles: category === 'cardio' ? [] : creating.muscles });
    setCreating(null);
    pick(ex);
  };

  const pick = (ex: Exercise) => {
    if (picker?.mode === 'replace') {
      setBlocks((bs) => bs.map((b) => (b.key === picker.blockKey ? { ...newBlock(ex.id, sessions, prefs), key: b.key } : b)));
    } else {
      setBlocks((bs) => [...bs, newBlock(ex.id, sessions, prefs)]);
    }
    setPicker(null);
  };

  const errorCount = Object.keys(errors).length;

  return (
    <View>
      {!session && (
        <Segmented
          value={category}
          onChange={(c) => {
            setCategory(c);
            setErrors({});
          }}
          options={(['strength', 'cardio', 'bodyweight'] as Category[]).map((c) => ({
            value: c,
            label: CATEGORY_LABEL[c],
            icon: CATEGORY_ICON[c],
          }))}
        />
      )}

      <View style={styles.dateRow}>
        <Text style={type.small}>Day</Text>
        <View style={styles.dateCtrl}>
          <IconButton icon="chevron-left" label="Previous day" size={20} onPress={() => onDateChange(addDays(date, -1))} />
          <Text style={[type.bodyStrong, styles.dateText]}>{formatRelativeDay(date, today)}</Text>
          <IconButton
            icon="chevron-right"
            label="Next day"
            size={20}
            color={date >= today ? colors.border : colors.text}
            onPress={() => date < today && onDateChange(addDays(date, 1))}
          />
        </View>
      </View>

      {!session && (lastSession || categoryRoutines.length > 0) && (
        <View style={styles.quickStart}>
          <Text style={type.small}>Start from</Text>
          <ChipRow>
            {lastSession && (
              <Chip
                label={`Last ${CATEGORY_LABEL[category].toLowerCase()} · ${formatRelativeDay(lastSession.date, today)}`}
                icon="restore"
                onPress={() => loadEntries(lastSession.entries)}
              />
            )}
            {categoryRoutines.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                icon="bookmark-outline"
                onPress={() => loadEntries(r.entries)}
                onLongPress={() => confirmAction('Delete routine?', `“${r.name}” will be removed. Logged sessions stay.`, 'Delete', () => deleteRoutine(r.id))}
              />
            ))}
          </ChipRow>
        </View>
      )}

      {blocks.map((b) => (
        <BlockCard
          key={b.key}
          block={b}
          prefs={prefs}
          errors={errors}
          canRemove={blocks.length > 1}
          onPickExercise={() => setPicker({ mode: 'replace', blockKey: b.key })}
          onRemove={() => setBlocks((bs) => bs.filter((x) => x.key !== b.key))}
          onChange={(patch) => updateBlock(b.key, patch)}
          onSetChange={(sKey, patch) => updateSet(b.key, sKey, patch)}
          onAddSet={() => {
            const last = b.sets[b.sets.length - 1];
            updateBlock(b.key, {
              sets: [...b.sets, { key: newId(), reps: last?.reps ?? '', weight: last?.weight ?? '', origKg: last?.origKg, origText: last?.origText }],
            });
          }}
          onRemoveSet={(sKey) =>
            updateBlock(b.key, { sets: b.sets.length > 1 ? b.sets.filter((s) => s.key !== sKey) : [blankSet()] })
          }
        />
      ))}

      <Text style={[type.section, styles.recentTitle]}>{blocks.length ? 'Add exercise' : 'Choose an exercise'}</Text>
      <ChipRow>
        {recent.map((id) => {
          const ex = getExercise(id);
          return (
            <Chip
              key={id}
              label={ex.name}
              icon={ex.icon}
              iconColor={exerciseIconColor(id)}
              onPress={() => setBlocks((bs) => [...bs, newBlock(id, sessions, prefs)])}
            />
          );
        })}
        <Chip label="All" icon="plus" onPress={() => setPicker({ mode: 'add' })} />
      </ChipRow>

      {errorCount > 0 && (
        <Text style={styles.formError} accessibilityLiveRegion="polite">
          {errors.form ?? 'Check the highlighted fields.'}
        </Text>
      )}
      <Button label={saveLabel} onPress={save} style={styles.save} disabled={!blocks.length} />
      {!session && blocks.length > 0 && (
        <Text style={styles.saveRoutine} onPress={() => setRoutineName('')} accessibilityRole="button">
          Save as routine
        </Text>
      )}

      <Sheet visible={routineName !== null} onClose={() => setRoutineName(null)} title="Save as routine">
        <Field
          label="Name"
          value={routineName ?? ''}
          onChangeText={setRoutineName}
          placeholder="e.g. Push day"
          autoFocus
          maxLength={30}
          onSubmitEditing={confirmRoutine}
        />
        <Text style={[type.caption, styles.sheetNote]}>
          Saves these exercises with their sets, distances and times. Load it from “Start from” next time.
        </Text>
        <Button label="Save routine" onPress={confirmRoutine} disabled={!(routineName ?? '').trim()} style={styles.sheetBtn} />
      </Sheet>

      <Sheet
        visible={!!picker}
        onClose={() => {
          setPicker(null);
          setCreating(null);
        }}
        title={`${CATEGORY_LABEL[category]} exercises`}>
        {exercisesIn(category).map((ex) => (
          <Pressable
            key={ex.id}
            onPress={() => pick(ex)}
            style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
            accessibilityRole="button">
            <Icon name={ex.icon} size={22} color={exerciseIconColor(ex.id)} />
            <Text style={[type.body, styles.flex]}>{ex.name}</Text>
            {ex.custom && <Text style={type.caption}>Custom</Text>}
          </Pressable>
        ))}
        {creating ? (
          <View style={styles.createBox}>
            <Field label="Name" value={creating.name} onChangeText={(name) => setCreating({ ...creating, name })} placeholder="e.g. Jumping jacks" autoFocus maxLength={30} />
            <Text style={styles.createLabel}>Measured by</Text>
            <ChipRow>
              {KINDS_BY_CATEGORY[category].map((k) => (
                <Chip key={k} label={KIND_LABEL[k]} selected={creating.kind === k} onPress={() => setCreating({ ...creating, kind: k })} />
              ))}
            </ChipRow>
            {category !== 'cardio' && (
              <>
                <Text style={styles.createLabel}>Muscles</Text>
                <View style={styles.wrap}>
                  {MUSCLES.map((m) => {
                    const on = creating.muscles.includes(m);
                    return (
                      <Chip
                        key={m}
                        label={MUSCLE_LABEL[m]}
                        selected={on}
                        onPress={() => setCreating({ ...creating, muscles: on ? creating.muscles.filter((x) => x !== m) : [...creating.muscles, m] })}
                      />
                    );
                  })}
                </View>
              </>
            )}
            <Button label="Create exercise" onPress={createExercise} disabled={!creating.name.trim()} style={styles.sheetBtn} />
          </View>
        ) : (
          <Pressable
            onPress={() => setCreating({ name: '', kind: defaultKindFor(category), muscles: [] })}
            style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
            accessibilityRole="button">
            <Icon name="plus" size={22} color={colors.primary} />
            <Text style={[type.bodyStrong, styles.createText]}>Create exercise</Text>
          </Pressable>
        )}
      </Sheet>
    </View>
  );
}

const KINDS_BY_CATEGORY: Record<Category, ExerciseKind[]> = {
  strength: ['strength', 'reps'],
  bodyweight: ['reps', 'duration'],
  cardio: ['distance', 'duration'],
};

function recentIn(category: Category, sessions: Session[]): string[] {
  return exercisesUsed(sessions).filter((id) => getExercise(id).category === category);
}

// ---------- block ----------

interface BlockProps {
  block: BlockDraft;
  prefs: UnitPrefs;
  errors: Errors;
  canRemove: boolean;
  onPickExercise: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<BlockDraft>) => void;
  onSetChange: (setKey: string, patch: Partial<SetDraft>) => void;
  onAddSet: () => void;
  onRemoveSet: (setKey: string) => void;
}

function BlockCard({ block, prefs, errors, canRemove, onPickExercise, onRemove, onChange, onSetChange, onAddSet, onRemoveSet }: BlockProps) {
  const ex = getExercise(block.exerciseId);
  const k = block.key;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Exercise</Text>
      <View style={styles.exRow}>
        <Pressable
          onPress={onPickExercise}
          style={({ pressed }) => [styles.select, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Exercise: ${ex.name}. Change`}>
          <Icon name={ex.icon} size={22} color={exerciseIconColor(ex.id)} />
          <Text style={[type.body, styles.flex]} numberOfLines={1}>
            {ex.name}
          </Text>
          <Icon name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>
        {canRemove && <IconButton icon="close" label={`Remove ${ex.name}`} onPress={onRemove} color={colors.textSecondary} />}
      </View>

      {(ex.kind === 'strength' || ex.kind === 'reps') && (
        <View style={[styles.table, errors[`${k}:empty`] && styles.tableError]}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.setCol]}>Set</Text>
            {ex.kind === 'strength' && <Text style={[styles.th, styles.flex]}>{prefs.weightUnit}</Text>}
            <Text style={[styles.th, styles.flex]}>Reps</Text>
            <View style={styles.trashCol} />
          </View>
          {block.sets.map((s, i) => (
            <View key={s.key} style={[styles.tr, i > 0 && styles.trBorder]}>
              <Text style={[styles.setNum, styles.setCol, tabular]}>{i + 1}</Text>
              {ex.kind === 'strength' && (
                <NumberCell
                  decimal
                  value={s.weight}
                  label={`Set ${i + 1} weight in ${prefs.weightUnit}`}
                  invalid={!!errors[`${k}:${s.key}:weight`]}
                  onChangeText={(t) => onSetChange(s.key, { weight: t })}
                />
              )}
              <NumberCell
                value={s.reps}
                label={`Set ${i + 1} reps`}
                invalid={!!errors[`${k}:${s.key}:reps`]}
                onChangeText={(t) => onSetChange(s.key, { reps: t })}
              />
              <View style={styles.trashCol}>
                <IconButton icon="trash-can-outline" label={`Delete set ${i + 1}`} size={20} color={colors.textSecondary} onPress={() => onRemoveSet(s.key)} />
              </View>
            </View>
          ))}
          <Pressable onPress={onAddSet} style={({ pressed }) => [styles.addSet, pressed && styles.pressed]} accessibilityRole="button">
            <Icon name="plus-circle-outline" size={20} />
            <Text style={type.bodyStrong}>Add set</Text>
          </Pressable>
          <RestChips />
          {errors[`${k}:empty`] && <Text style={styles.inlineError}>{errors[`${k}:empty`]}</Text>}
        </View>
      )}

      {ex.kind === 'duration' && (
        <View>
          <Stopwatch label={isHold(ex) ? 'Hold' : 'Workout'} onStop={(sec) => onChange({ durMin: String(Math.floor(sec / 60)), durSec: String(sec % 60) })} />
          <DurationInputs block={block} onChange={onChange} error={errors[`${k}:dur`]} label={isHold(ex) ? 'Hold time' : 'Workout time'} />
          <ChipRow>
            {(isHold(ex) ? [30, 60, 90, 120, 180] : [900, 1800, 2700, 3600]).map((sec) => (
              <Chip
                key={sec}
                label={sec >= 900 ? `${sec / 60} min` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}
                selected={Number(block.durMin || 0) * 60 + Number(block.durSec || 0) === sec}
                onPress={() => onChange({ durMin: String(Math.floor(sec / 60)), durSec: String(sec % 60) })}
              />
            ))}
          </ChipRow>
        </View>
      )}

      {ex.kind === 'distance' && (
        <View style={styles.cardio}>
          <Field
            label="Distance"
            value={block.distance}
            onChangeText={(t) => onChange({ distance: t })}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0.0"
            suffix={prefs.distanceUnit}
            error={errors[`${k}:dist`]}
          />
          <DurationInputs block={block} onChange={onChange} error={errors[`${k}:dur`]} label="Time (optional)" />
          <PaceLine block={block} prefs={prefs} />
        </View>
      )}
      {block.stats && describeStats(block.stats) ? (
        <View style={styles.statsLine}>
          <Icon name="watch-variant" size={16} color={colors.textSecondary} />
          <Text style={[type.small, tabular]}>From your watch: {describeStats(block.stats)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DurationInputs({
  block,
  onChange,
  error,
  label,
}: {
  block: BlockDraft;
  onChange: (p: Partial<BlockDraft>) => void;
  error?: string;
  label: string;
}) {
  return (
    <View style={styles.durWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.durRow}>
        <Field
          value={block.durMin}
          onChangeText={(t) => onChange({ durMin: t })}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="0"
          suffix="min"
          accessibilityLabel={`${label} minutes`}
          style={styles.flex}
          inputStyle={error ? styles.errBorder : undefined}
          maxLength={4}
        />
        <Field
          value={block.durSec}
          onChangeText={(t) => onChange({ durSec: t })}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="00"
          suffix="sec"
          accessibilityLabel={`${label} seconds`}
          style={styles.flex}
          inputStyle={error ? styles.errBorder : undefined}
          maxLength={2}
        />
      </View>
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
    </View>
  );
}

function PaceLine({ block, prefs }: { block: BlockDraft; prefs: UnitPrefs }) {
  const d = parseDecimal(block.distance);
  const sec = (Number(block.durMin) || 0) * 60 + (Number(block.durSec) || 0);
  if (!(d > 0) || !sec) return null;
  const pace = formatPaceOrSpeed(block.exerciseId, distanceToMeters(d, prefs.distanceUnit), sec, prefs.distanceUnit);
  return pace ? <Text style={[type.small, tabular]}>Pace {pace}</Text> : null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { backgroundColor: colors.surfaceMuted },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  dateCtrl: { flexDirection: 'row', alignItems: 'center' },
  dateText: { minWidth: 96, textAlign: 'center' },
  block: { marginTop: space.md },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space.sm },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  select: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 56,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  table: {
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  tableError: { borderColor: colors.coral },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: space.md,
    height: 40,
  },
  th: { fontSize: 14, color: colors.text, textAlign: 'center', fontWeight: '500' },
  setCol: { width: 36 },
  trashCol: { width: 40, alignItems: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 8 },
  trBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  setNum: { fontSize: 17, textAlign: 'center', color: colors.text },
  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 46,
    margin: space.md,
    marginTop: space.xs,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surfaceMuted,
  },
  statsLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  inlineError: { fontSize: 12, color: colors.danger, marginTop: 4, marginHorizontal: space.md, marginBottom: space.sm },
  durWrap: { marginTop: space.md, marginBottom: space.sm },
  durRow: { flexDirection: 'row', gap: space.sm },
  errBorder: { borderColor: colors.coral },
  cardio: { marginTop: space.md, gap: 2 },
  recentTitle: { marginTop: space.xl, marginBottom: space.md, fontSize: 16 },
  formError: { color: colors.danger, fontSize: 13, marginTop: space.lg, textAlign: 'center' },
  save: { marginTop: space.lg },
  quickStart: { marginTop: space.md, gap: space.sm },
  saveRoutine: { fontSize: 15, fontWeight: '600', color: colors.primary, textAlign: 'center', paddingVertical: space.md },
  sheetNote: { marginTop: space.sm },
  sheetBtn: { marginTop: space.lg, marginBottom: space.md },
  createBox: { paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: space.sm },
  createLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
  createText: { color: colors.primary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: 52, paddingHorizontal: space.sm, borderRadius: radius.sm },
});
