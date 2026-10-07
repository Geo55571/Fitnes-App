import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { mergeBackup, type BackupData } from '@/domain/backup';
import { addDays } from '@/domain/dates';
import { CUSTOM_ICON, setCustomExercises, type Exercise } from '@/domain/exercises';
import { checkProgression } from '@/domain/goals';
import type { PlannedWorkout } from '@/domain/workoutScan';
import {
  EMPTY_WINTER_ARC,
  parseWinterArc,
  patchDay,
  type ArcWeeklyRule,
  type ArcWorkoutKind,
  type ChallengeException,
  type DailyChallengeEntry,
  type EnduranceActivity,
  type WinterArcData,
} from '@/domain/winterArc';
import type {
  AvatarConfig,
  Category,
  Challenge,
  DayKey,
  Entry,
  Goal,
  Group,
  Person,
  Profile,
  Routine,
  Session,
  Settings,
  TrackerConfig,
} from '@/domain/types';
import { buildDemoData } from '@/sample/demo';

import { createChunkedStorage } from './chunkedStorage';
import { DEFAULT_AVATAR, DEFAULT_PROFILE, DEFAULT_SETTINGS, DEFAULT_TRACKERS, ME } from './defaults';
import { inviteCode, newId } from './ids';
import { kv } from './kv';

export interface SessionInput {
  date: DayKey;
  category: Category;
  entries: Omit<Entry, 'id'>[];
  /** Defaults to now. */
  performedAt?: string;
  source?: Session['source'];
}

/** A strength or endurance workout added from Winter Arc. Saved as a normal session. */
export interface ArcWorkoutInput {
  date: DayKey;
  kind: ArcWorkoutKind;
  activity?: EnduranceActivity;
  name: string;
  durationSec?: number;
  distanceM?: number;
  note?: string;
  performedAt?: string;
}

export type GoalInput = Omit<Goal, 'id' | 'createdAt' | 'startDate' | 'endDate'> & { startDate?: DayKey };

/**
 * Persisted state — identical in shape to a backup file's data.
 * `sessions` are the local user's (personId === 'me'); `people`/`peopleSessions` are others'.
 */
type DataState = BackupData & {
  /** Synced challenge totals: challengeId → personId → value (cache for offline viewing). */
  challengeTotals: Record<string, Record<string, number>>;
  /** Winter Arc 2026/27 check-ins. Kept on this device only; never synced. */
  winterArc: WinterArcData;
};

/** Everything downloaded by a group sync; replaces the previous download wholesale. */
export interface RemoteData {
  groups: Group[];
  people: Person[];
  peopleSessions: Session[];
  challengeTotals: Record<string, Record<string, number>>;
}

interface Actions {
  completeOnboarding(p: { name: string; distanceUnit: Settings['distanceUnit']; weightUnit: Settings['weightUnit'] }): void;
  updateProfile(p: Partial<Profile>): void;
  updateSettings(s: Partial<Settings>): void;
  updateAvatar(a: Partial<AvatarConfig>): void;
  setTrackers(t: TrackerConfig[]): void;

  addSession(input: SessionInput): Session;
  /** Saves workouts read from a photo, one session each; creates custom exercises when needed. */
  addScannedWorkouts(items: PlannedWorkout[]): Session[];
  updateSession(id: string, input: SessionInput): void;
  deleteSession(id: string): void;

  addGoal(input: GoalInput, today: DayKey): Goal;
  /** Edits apply from today; a goal that already has history is split into a revision. */
  updateGoal(id: string, input: GoalInput, today: DayKey): void;
  deleteGoal(id: string, today: DayKey): void;
  toggleTodo(goalId: string, date: DayKey): void;
  /** Weekly check for goals set to raise themselves. Returns the goals that were raised. */
  runProgressions(today: DayKey): { goal: Goal; from: number }[];

  createGroup(name: string): Group;
  renameGroup(id: string, name: string): void;
  deleteGroup(id: string): void;
  regenerateInvite(id: string): void;
  addChallenge(groupId: string, c: Omit<Challenge, 'id' | 'createdAt'>): void;
  deleteChallenge(groupId: string, challengeId: string): void;

  loadDemo(today: DayKey): void;
  clearDemo(): void;
  resetAll(): void;

  addCustomExercise(e: Pick<Exercise, 'name' | 'category' | 'kind' | 'muscles'>): Exercise;
  deleteCustomExercise(id: string): void;
  saveRoutine(r: Pick<Routine, 'name' | 'category' | 'entries'>): Routine;
  deleteRoutine(id: string): void;

  joinWinterArc(trackFrom: DayKey): void;
  /** Stops showing the challenge. Check-ins stay saved, so joining again restores them. */
  leaveWinterArc(): void;
  setArcTrackFrom(date: DayKey): void;
  updateArcDay(date: DayKey, patch: Partial<Omit<DailyChallengeEntry, 'updatedAt'>>): void;
  setArcWeekException(monday: DayKey, rule: ArcWeeklyRule, exception: ChallengeException | null): void;
  /** Creates (or, with an id, updates) the workout's session and its Winter Arc details. */
  saveArcWorkout(input: ArcWorkoutInput, sessionId?: string): Session;
  deleteArcWorkout(sessionId: string): void;

  /** Replace synced data with a fresh download (local and sample data are kept). */
  applyRemote(data: RemoteData): void;
  /** Drop all synced data (on sign-out). */
  clearRemote(): void;

  /** Snapshot of everything for a backup (synced data is left out — it re-downloads). */
  exportData(): BackupData;
  /** 'merge' adds what's missing; 'replace' swaps all data for the backup's. */
  importData(data: BackupData, mode: 'merge' | 'replace'): void;
}

export type AppState = DataState & Actions;

/** Older saves described a procedural figure (frame/hair/top); map them onto a 3D model. */
function migrateAvatar(base: AvatarConfig, saved?: Partial<AvatarConfig> & { frame?: string }): AvatarConfig {
  if (!saved) return base;
  const { frame, ...rest } = saved as Partial<AvatarConfig> & { frame?: string; hair?: string; top?: string };
  delete (rest as { hair?: string }).hair;
  delete (rest as { top?: string }).top;
  const model = rest.model ?? (frame === 'curvy' ? 'woman-casual' : base.model);
  return { ...base, ...rest, model };
}

const initialData = (): DataState => ({
  profile: { ...DEFAULT_PROFILE, createdAt: new Date().toISOString() },
  settings: DEFAULT_SETTINGS,
  avatar: DEFAULT_AVATAR,
  trackers: DEFAULT_TRACKERS,
  sessions: [],
  goals: [],
  goalChecks: {},
  groups: [],
  people: [],
  peopleSessions: [],
  demoLoaded: false,
  customExercises: [],
  routines: [],
  challengeTotals: {},
  winterArc: EMPTY_WINTER_ARC,
});

function sanitizeEntries(entries: Omit<Entry, 'id'>[]): Entry[] {
  return entries.map((e) => ({ ...e, id: newId('e') }));
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData(),

      completeOnboarding: ({ name, distanceUnit, weightUnit }) =>
        set((s) => ({
          profile: { ...s.profile, name: name.trim(), onboarded: true },
          settings: { ...s.settings, distanceUnit, weightUnit },
        })),

      updateProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      updateAvatar: (a) => set((s) => ({ avatar: { ...s.avatar, ...a } })),
      setTrackers: (trackers) => set({ trackers }),

      addSession: (input) => {
        const now = new Date().toISOString();
        const session: Session = {
          id: newId('s'),
          personId: ME,
          date: input.date,
          performedAt: input.performedAt ?? now,
          category: input.category,
          entries: sanitizeEntries(input.entries),
          createdAt: now,
          updatedAt: now,
          ...(input.source ? { source: input.source } : {}),
        };
        set((s) => ({ sessions: [...s.sessions, session] }));
        return session;
      },

      addScannedWorkouts: (items) => {
        const created: Session[] = [];
        for (const item of items) {
          let exerciseId = item.exerciseId;
          if (!exerciseId) {
            const name = item.customName ?? item.title;
            const existing = get().customExercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
            exerciseId =
              existing?.id ?? get().addCustomExercise({ name, category: item.category, kind: item.customKind ?? 'duration', muscles: [] }).id;
          }
          created.push(
            get().addSession({
              date: item.date,
              category: item.category,
              performedAt: item.performedAt,
              source: 'photo',
              entries: [{ ...item.entry, exerciseId }],
            }),
          );
        }
        return created;
      },

      updateSession: (id, input) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === id
              ? {
                  ...x,
                  date: input.date,
                  category: input.category,
                  entries: sanitizeEntries(input.entries),
                  updatedAt: new Date().toISOString(),
                }
              : x,
          ),
        })),

      deleteSession: (id) =>
        set((s) => {
          if (!s.winterArc.workouts[id]) return { sessions: s.sessions.filter((x) => x.id !== id) };
          const { [id]: _gone, ...workouts } = s.winterArc.workouts;
          return { sessions: s.sessions.filter((x) => x.id !== id), winterArc: { ...s.winterArc, workouts } };
        }),

      addGoal: (input, today) => {
        const goal: Goal = {
          ...input,
          id: newId('g'),
          startDate: input.startDate ?? today,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ goals: [...s.goals, goal] }));
        return goal;
      },

      updateGoal: (id, input, today) => {
        const old = get().goals.find((g) => g.id === id);
        if (!old) return;
        const measurableChanged =
          old.kind !== input.kind ||
          old.exerciseId !== input.exerciseId ||
          old.metric !== input.metric ||
          old.target !== input.target ||
          JSON.stringify(old.schedule) !== JSON.stringify(input.schedule);

        if (!measurableChanged || old.startDate >= today) {
          set((s) => ({
            goals: s.goals.map((g) =>
              g.id === id ? { ...g, ...input, startDate: old.startDate >= today ? (input.startDate ?? old.startDate) : old.startDate } : g,
            ),
          }));
          return;
        }
        // Keep the old revision for history, start a new one today.
        const revision: Goal = {
          ...old,
          ...input,
          id: newId('g'),
          startDate: today,
          endDate: undefined,
          createdAt: new Date().toISOString(),
        };
        set((s) => {
          const checks = { ...s.goalChecks };
          const todayChecked = (checks[id] ?? []).includes(today);
          if (todayChecked) {
            checks[id] = checks[id].filter((d) => d !== today);
            checks[revision.id] = [today];
          }
          return {
            goals: [...s.goals.map((g) => (g.id === id ? { ...g, endDate: addDays(today, -1) } : g)), revision],
            goalChecks: checks,
          };
        });
      },

      deleteGoal: (id, today) =>
        set((s) => {
          const goal = s.goals.find((g) => g.id === id);
          if (!goal) return {};
          if (goal.startDate >= today) {
            const checks = { ...s.goalChecks };
            delete checks[id];
            return { goals: s.goals.filter((g) => g.id !== id), goalChecks: checks };
          }
          // Retire instead of deleting so past days keep their results.
          const checks = { ...s.goalChecks };
          if (checks[id]) checks[id] = checks[id].filter((d) => d < today);
          return {
            goals: s.goals.map((g) => (g.id === id ? { ...g, endDate: addDays(today, -1) } : g)),
            goalChecks: checks,
          };
        }),

      runProgressions: (today) => {
        const raised: { goal: Goal; from: number }[] = [];
        for (const g of get().goals) {
          if (g.endDate && g.endDate < today) continue;
          const check = checkProgression(g, get().sessions, today);
          if (!check) continue;
          const autoIncrease = { ...g.autoIncrease!, checkedWeek: check.week };
          if (check.raise) {
            const { id: _id, createdAt: _c, startDate: _s, endDate: _e, ...input } = g;
            get().updateGoal(g.id, { ...input, target: g.target! + g.autoIncrease!.step, autoIncrease }, today);
            const next = get().goals.find((x) => x.exerciseId === g.exerciseId && x.metric === g.metric && !x.endDate && x.startDate === today);
            if (next) raised.push({ goal: next, from: g.target! });
          } else {
            set((s) => ({ goals: s.goals.map((x) => (x.id === g.id ? { ...x, autoIncrease } : x)) }));
          }
        }
        return raised;
      },

      toggleTodo: (goalId, date) =>
        set((s) => {
          const days = s.goalChecks[goalId] ?? [];
          const next = days.includes(date) ? days.filter((d) => d !== date) : [...days, date];
          return { goalChecks: { ...s.goalChecks, [goalId]: next } };
        }),

      createGroup: (name) => {
        const group: Group = {
          id: newId('grp'),
          name: name.trim(),
          createdAt: new Date().toISOString(),
          memberIds: [ME],
          inviteCode: inviteCode(),
          challenges: [],
        };
        set((s) => ({ groups: [...s.groups, group] }));
        return group;
      },

      renameGroup: (id, name) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)) })),

      deleteGroup: (id) => set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),

      regenerateInvite: (id) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, inviteCode: inviteCode() } : g)) })),

      addChallenge: (groupId, c) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId
              ? { ...g, challenges: [...g.challenges, { ...c, id: newId('c'), createdAt: new Date().toISOString() }] }
              : g,
          ),
        })),

      deleteChallenge: (groupId, challengeId) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, challenges: g.challenges.filter((c) => c.id !== challengeId) } : g,
          ),
        })),

      loadDemo: (today) => {
        if (get().demoLoaded) return;
        const demo = buildDemoData(today);
        set((s) => ({
          people: [...s.people.filter((p) => p.source !== 'demo'), ...demo.people],
          peopleSessions: [...s.peopleSessions.filter((x) => !x.demo), ...demo.peopleSessions],
          sessions: [...s.sessions, ...demo.mySessions],
          groups: [...s.groups, ...demo.groups],
          demoLoaded: true,
        }));
      },

      clearDemo: () =>
        set((s) => {
          const demoPeople = new Set(s.people.filter((p) => p.source === 'demo').map((p) => p.id));
          return {
            people: s.people.filter((p) => p.source !== 'demo'),
            peopleSessions: s.peopleSessions.filter((x) => !x.demo),
            sessions: s.sessions.filter((x) => !x.demo),
            groups: s.groups
              .filter((g) => !g.demo)
              .map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => !demoPeople.has(m)) })),
            demoLoaded: false,
          };
        }),

      resetAll: () => set(initialData()),

      addCustomExercise: (e) => {
        const ex: Exercise = { ...e, name: e.name.trim(), id: newId('x'), icon: CUSTOM_ICON[e.kind], custom: true };
        set((s) => ({ customExercises: [...s.customExercises, ex] }));
        return ex;
      },
      deleteCustomExercise: (id) => set((s) => ({ customExercises: s.customExercises.filter((e) => e.id !== id) })),

      saveRoutine: (r) => {
        const routine: Routine = { ...r, name: r.name.trim(), id: newId('r'), createdAt: new Date().toISOString() };
        set((s) => ({ routines: [...s.routines, routine] }));
        return routine;
      },
      deleteRoutine: (id) => set((s) => ({ routines: s.routines.filter((r) => r.id !== id) })),

      joinWinterArc: (trackFrom) =>
        set((s) => ({ winterArc: { ...s.winterArc, joinedAt: new Date().toISOString(), trackFrom } })),
      leaveWinterArc: () => set((s) => ({ winterArc: { ...s.winterArc, joinedAt: null } })),
      setArcTrackFrom: (trackFrom) => set((s) => ({ winterArc: { ...s.winterArc, trackFrom } })),

      updateArcDay: (date, patch) =>
        set((s) => {
          const days = { ...s.winterArc.days };
          const next = patchDay(days[date], patch, new Date().toISOString());
          if (next) days[date] = next;
          else delete days[date];
          return { winterArc: { ...s.winterArc, days } };
        }),

      setArcWeekException: (monday, rule, exception) =>
        set((s) => {
          const week = { ...s.winterArc.weeks[monday] };
          if (exception) week[rule] = exception.note?.trim() ? { note: exception.note.trim().slice(0, 280) } : {};
          else delete week[rule];
          const weeks = { ...s.winterArc.weeks };
          if (week.strength || week.endurance) weeks[monday] = week;
          else delete weeks[monday];
          return { winterArc: { ...s.winterArc, weeks } };
        }),

      saveArcWorkout: (input, sessionId) => {
        let exerciseId = 'strengthtraining';
        if (input.kind === 'endurance') {
          if (input.activity === 'cycling') exerciseId = 'cycling';
          else if (input.activity === 'other') {
            const existing = get().customExercises.find((e) => e.category === 'cardio' && e.name.toLowerCase() === 'endurance');
            exerciseId = existing?.id ?? get().addCustomExercise({ name: 'Endurance', category: 'cardio', kind: 'distance', muscles: [] }).id;
          } else exerciseId = 'running';
        }
        const entry: Omit<Entry, 'id'> = { exerciseId };
        if (input.durationSec) entry.durationSec = Math.round(input.durationSec);
        if (input.kind === 'endurance' && input.distanceM) entry.distanceM = input.distanceM;
        const sessionInput: SessionInput = {
          date: input.date,
          category: input.kind === 'strength' ? 'strength' : 'cardio',
          entries: [entry],
          performedAt: input.performedAt,
        };
        const existing = sessionId ? get().sessions.find((x) => x.id === sessionId) : undefined;
        if (existing) get().updateSession(existing.id, sessionInput);
        const session = existing ? get().sessions.find((x) => x.id === existing.id)! : get().addSession(sessionInput);
        const note = input.note?.trim().slice(0, 280);
        set((s) => ({
          winterArc: {
            ...s.winterArc,
            workouts: {
              ...s.winterArc.workouts,
              [session.id]: {
                kind: input.kind,
                name: input.name.trim().slice(0, 60),
                ...(input.kind === 'endurance' && input.activity ? { activity: input.activity } : {}),
                ...(note ? { note } : {}),
              },
            },
          },
        }));
        return session;
      },

      deleteArcWorkout: (sessionId) => get().deleteSession(sessionId),

      applyRemote: (d) =>
        set((s) => ({
          groups: [...s.groups.filter((g) => !g.remote), ...d.groups],
          people: [...s.people.filter((p) => p.source !== 'remote'), ...d.people],
          peopleSessions: [...s.peopleSessions.filter((x) => !x.remote), ...d.peopleSessions],
          challengeTotals: d.challengeTotals,
        })),
      clearRemote: () =>
        set((s) => ({
          groups: s.groups.filter((g) => !g.remote),
          people: s.people.filter((p) => p.source !== 'remote'),
          peopleSessions: s.peopleSessions.filter((x) => !x.remote),
          challengeTotals: {},
        })),

      exportData: () => {
        const s = get();
        return {
          profile: s.profile,
          settings: s.settings,
          avatar: s.avatar,
          trackers: s.trackers,
          sessions: s.sessions,
          goals: s.goals,
          goalChecks: s.goalChecks,
          groups: s.groups.filter((g) => !g.remote),
          people: s.people.filter((p) => p.source !== 'remote'),
          peopleSessions: s.peopleSessions.filter((x) => !x.remote),
          demoLoaded: s.demoLoaded,
          customExercises: s.customExercises,
          routines: s.routines,
          winterArc: s.winterArc,
        };
      },

      importData: (data, mode) =>
        set((s) => {
          if (mode === 'merge') return mergeBackup(s.exportData(), data);
          const base = initialData();
          return {
            ...data,
            profile: { ...base.profile, ...data.profile, onboarded: true },
            settings: { ...base.settings, ...data.settings },
            avatar: { ...base.avatar, ...data.avatar },
            trackers: data.trackers.length ? data.trackers : base.trackers,
            winterArc: parseWinterArc(data.winterArc),
          };
        }),
    }),
    {
      name: 'form-fitness-v1',
      version: 1,
      // History is saved per month in a key-value database; older single-record saves migrate on load.
      storage: createChunkedStorage<DataState>(kv, AsyncStorage),
      partialize: (s): DataState => ({
        profile: s.profile,
        settings: s.settings,
        avatar: s.avatar,
        trackers: s.trackers,
        sessions: s.sessions,
        goals: s.goals,
        goalChecks: s.goalChecks,
        groups: s.groups,
        people: s.people,
        peopleSessions: s.peopleSessions,
        demoLoaded: s.demoLoaded,
        customExercises: s.customExercises,
        routines: s.routines,
        challengeTotals: s.challengeTotals,
        winterArc: s.winterArc,
      }),
      // Fill in any fields added after a user's data was first saved.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DataState>;
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...p.settings },
          avatar: migrateAvatar(current.avatar, p.avatar),
          profile: { ...current.profile, ...p.profile },
          winterArc: p.winterArc ? parseWinterArc(p.winterArc) : current.winterArc,
        };
      },
    },
  ),
);

export { ME };

// Keep the exercise catalog aware of the user's custom exercises.
setCustomExercises(useStore.getState().customExercises);
useStore.subscribe((s, prev) => {
  if (s.customExercises !== prev.customExercises) setCustomExercises(s.customExercises);
});
