import type { ComponentProps } from 'react';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { Category, ExerciseKind, Metric } from './types';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type Muscle = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';

export const MUSCLES: Muscle[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

export interface Exercise {
  id: string;
  name: string;
  kind: ExerciseKind;
  category: Category;
  icon: IconName;
  /** Primary muscle groups (cardio has none). */
  muscles: Muscle[];
  /** Created by the user on this device. */
  custom?: boolean;
}

export const EXERCISES: Exercise[] = [
  // Bodyweight
  { id: 'pushups', name: 'Push-ups', kind: 'reps', category: 'bodyweight', icon: 'arm-flex', muscles: ['chest', 'arms'] },
  { id: 'pullups', name: 'Pull-ups', kind: 'reps', category: 'bodyweight', icon: 'human-handsup', muscles: ['back', 'arms'] },
  { id: 'squats', name: 'Air squats', kind: 'reps', category: 'bodyweight', icon: 'human', muscles: ['legs'] },
  { id: 'situps', name: 'Sit-ups', kind: 'reps', category: 'bodyweight', icon: 'yoga', muscles: ['core'] },
  { id: 'dips', name: 'Dips', kind: 'reps', category: 'bodyweight', icon: 'human-male', muscles: ['chest', 'arms'] },
  { id: 'burpees', name: 'Burpees', kind: 'reps', category: 'bodyweight', icon: 'jump-rope', muscles: ['legs', 'chest'] },
  { id: 'plank', name: 'Plank', kind: 'duration', category: 'bodyweight', icon: 'timer-sand', muscles: ['core'] },
  // Cardio
  { id: 'running', name: 'Run', kind: 'distance', category: 'cardio', icon: 'run', muscles: [] },
  { id: 'cycling', name: 'Cycling', kind: 'distance', category: 'cardio', icon: 'bike', muscles: [] },
  { id: 'walking', name: 'Walk', kind: 'distance', category: 'cardio', icon: 'walk', muscles: [] },
  { id: 'hiking', name: 'Hike', kind: 'distance', category: 'cardio', icon: 'hiking', muscles: [] },
  { id: 'swimming', name: 'Swim', kind: 'distance', category: 'cardio', icon: 'swim', muscles: [] },
  { id: 'rowing', name: 'Rowing', kind: 'distance', category: 'cardio', icon: 'rowing', muscles: [] },
  // Timed workouts (what a watch records for classes and gym sessions without sets).
  { id: 'elliptical', name: 'Elliptical', kind: 'duration', category: 'cardio', icon: 'run-fast', muscles: [] },
  { id: 'hiit', name: 'HIIT', kind: 'duration', category: 'cardio', icon: 'lightning-bolt', muscles: [] },
  { id: 'yoga', name: 'Yoga', kind: 'duration', category: 'bodyweight', icon: 'meditation', muscles: ['core'] },
  // Strength
  { id: 'bench', name: 'Bench press', kind: 'strength', category: 'strength', icon: 'dumbbell', muscles: ['chest', 'arms'] },
  { id: 'backsquat', name: 'Back squat', kind: 'strength', category: 'strength', icon: 'weight-lifter', muscles: ['legs'] },
  { id: 'deadlift', name: 'Deadlift', kind: 'strength', category: 'strength', icon: 'weight-lifter', muscles: ['back', 'legs'] },
  { id: 'ohp', name: 'Overhead press', kind: 'strength', category: 'strength', icon: 'weight-lifter', muscles: ['shoulders'] },
  { id: 'row', name: 'Barbell row', kind: 'strength', category: 'strength', icon: 'dumbbell', muscles: ['back'] },
  { id: 'curl', name: 'Bicep curls', kind: 'strength', category: 'strength', icon: 'dumbbell', muscles: ['arms'] },
  { id: 'latpulldown', name: 'Lat pulldown', kind: 'strength', category: 'strength', icon: 'weight', muscles: ['back'] },
  { id: 'legpress', name: 'Leg press', kind: 'strength', category: 'strength', icon: 'weight', muscles: ['legs'] },
  { id: 'kbswing', name: 'Kettlebell swing', kind: 'strength', category: 'strength', icon: 'kettlebell', muscles: ['legs', 'back'] },
  { id: 'strengthtraining', name: 'Strength training', kind: 'duration', category: 'strength', icon: 'weight-lifter', muscles: [] },
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

const UNKNOWN: Exercise = {
  id: 'unknown',
  name: 'Exercise',
  kind: 'reps',
  category: 'bodyweight',
  icon: 'dumbbell',
  muscles: [],
};

// User-created exercises, registered by the store whenever they change.
let customList: Exercise[] = [];
let customById = new Map<string, Exercise>();

export function setCustomExercises(list: Exercise[]) {
  customList = list;
  customById = new Map(list.map((e) => [e.id, e]));
}

export function getExercise(id: string | undefined): Exercise {
  return (id && (BY_ID.get(id) ?? customById.get(id))) || UNKNOWN;
}

/** Built-in plus custom exercises. */
export function allExercises(): Exercise[] {
  return [...EXERCISES, ...customList];
}

export function exercisesIn(category: Category): Exercise[] {
  return allExercises().filter((e) => e.category === category);
}

export const KIND_LABEL: Record<ExerciseKind, string> = {
  reps: 'Reps',
  strength: 'Weight × reps',
  duration: 'Time',
  distance: 'Distance',
};

/** Sensible defaults for a new custom exercise in a category. */
export function defaultKindFor(category: Category): ExerciseKind {
  return category === 'strength' ? 'strength' : category === 'cardio' ? 'distance' : 'reps';
}

export const CUSTOM_ICON: Record<ExerciseKind, IconName> = {
  reps: 'human-handsup',
  strength: 'dumbbell',
  duration: 'timer-outline',
  distance: 'map-marker-distance',
};

/** Metrics that make sense for an exercise, most useful first. */
export function metricsFor(kind: ExerciseKind): Metric[] {
  switch (kind) {
    case 'reps':
      return ['reps', 'sets'];
    case 'strength':
      return ['sets', 'reps', 'volume'];
    case 'duration':
      return ['duration'];
    case 'distance':
      return ['distance', 'duration'];
  }
}

export function defaultMetric(kind: ExerciseKind): Metric {
  return metricsFor(kind)[0];
}

export const METRIC_LABEL: Record<Metric, string> = {
  reps: 'Reps',
  sets: 'Sets',
  volume: 'Volume',
  distance: 'Distance',
  duration: 'Time',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  bodyweight: 'Bodyweight',
};

export const CATEGORY_ICON: Record<Category, IconName> = {
  strength: 'dumbbell',
  cardio: 'run',
  bodyweight: 'human-handsup',
};
