/**
 * On-device AI for the phone app. A local language model needs WebGPU, which only the web
 * build has today, so phones use the rule-based interpreter alone (src/domain/workoutInterpreter).
 * The web build is in index.web.ts.
 */
import { create } from 'zustand';

import type { ScanActivity } from '@/domain/workoutScan';

import type { LocalAiState } from './types';

export type { LocalAiState, LocalAiStatus } from './types';

export const useLocalAi = create<LocalAiState>(() => ({
  status: 'unsupported',
  progress: 0,
  detail: 'The on-device AI model runs in the web version of FORM. In this app, workouts are read by the built-in interpreter.',
  model: null,
}));

export async function refreshLocalAi(): Promise<void> {}
export async function downloadLocalAi(): Promise<void> {}
export async function removeLocalAi(): Promise<void> {}
export function releaseLocalAi(): void {}

export async function classifyWithLocalAi(_name: string): Promise<ScanActivity | null> {
  return null;
}
