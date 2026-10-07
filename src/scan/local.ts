/**
 * Reads a workout photo entirely on this device:
 *   OCR (Apple Vision / ML Kit / Tesseract in the browser)
 *   → interpreter (labels, values, units — src/domain/workoutInterpreter)
 *   → on-device AI for workout names the interpreter doesn't know (web, when downloaded)
 * Nothing is sent to a server.
 */
import { classifyWithLocalAi } from '@/ai';
import { interpretWorkoutText, withActivity, type Interpretation } from '@/domain/workoutInterpreter';
import type { DayKey } from '@/domain/types';
import { ocrAvailability, recognizeText } from '@/ocr';

export type LocalStage = 'text' | 'understanding' | 'ai';

export interface LocalReading {
  interpretation: Interpretation;
  /** True when the on-device AI decided the workout type. */
  usedAi: boolean;
  /** The text lines OCR found, top to bottom. */
  lines: string[];
}

export const canReadOnDevice = () => ocrAvailability().available;

export async function readOnDevice(
  uri: string,
  ctx: { today: DayKey; distanceUnit: 'km' | 'mi' },
  onStage?: (s: LocalStage) => void,
): Promise<LocalReading> {
  onStage?.('text');
  const ocr = await recognizeText(uri, { level: 'accurate' });
  onStage?.('understanding');
  let interpretation = interpretWorkoutText(ocr.textBlocks, { ...ctx, icon: ocr.icon });
  let usedAi = false;
  if (interpretation.unknownName) {
    onStage?.('ai');
    const activity = await classifyWithLocalAi(interpretation.unknownName);
    if (activity && activity !== 'other') {
      interpretation = withActivity(interpretation, activity);
      usedAi = true;
    }
  }
  return { interpretation, usedAi, lines: ocr.textBlocks.map((b) => b.text) };
}
