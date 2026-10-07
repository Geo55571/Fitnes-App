/**
 * What the on-device AI is asked, kept engine-independent.
 *
 * Measured on a 1.5B model running in the browser: small local models are unreliable at
 * reading whole workout screens (they mix up and invent numbers), but good at one narrow
 * question — "what kind of workout is 'Funktionales Krafttraining'?" — in any language.
 * So numbers always come from the rule-based interpreter, and the AI only names the
 * workout type when the interpreter doesn't recognize the workout's name.
 */
import { SCAN_ACTIVITIES, type ScanActivity } from './workoutScan';

export const CLASSIFY_SYSTEM_PROMPT = `Classify a workout by its name as shown on a fitness watch or app (any language). Answer with exactly one word from this list:
running (runs, jogs, treadmill), walking, hiking, cycling (rides, bikes, spinning), swimming, rowing, elliptical, hiit (interval or circuit training, bootcamp, crossfit), strength_training (weights, kettlebells, functional or core strength, gym), yoga, other (anything else: dance, pilates, tennis, climbing…).`;

export const classifyUserPrompt = (name: string) => `Workout name: ${name.slice(0, 60)}`;

/** EBNF grammar: the model can only answer with one of the activity words. */
export const ACTIVITY_GRAMMAR = `root ::= ${SCAN_ACTIVITIES.map((a) => `"${a}"`).join(' | ')}`;

export function parseActivity(answer: string): ScanActivity | null {
  const a = answer.trim().toLowerCase() as ScanActivity;
  return SCAN_ACTIVITIES.includes(a) ? a : null;
}
