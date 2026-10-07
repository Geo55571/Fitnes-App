/**
 * Phone OCR engine: the app's own native module (modules/form-ocr) — Apple Vision on iOS,
 * Google ML Kit (bundled model) on Android. Runs entirely on the device.
 */
import FormOcr from '../../modules/form-ocr';

import type { EngineOutput, OcrLevel, OcrProgress } from './types';

export class OcrUnavailableError extends Error {}

export function ocrAvailability(): { available: boolean; reason?: string } {
  if (FormOcr) return { available: true };
  return {
    available: false,
    reason:
      'Reading text on this device needs the full FORM app. It isn’t included in Expo Go — build the app with “npx expo run:ios” / “npx expo run:android” or EAS.',
  };
}

export async function runEngine(uri: string, level: OcrLevel, _onProgress?: (p: OcrProgress) => void): Promise<EngineOutput> {
  if (!FormOcr) throw new OcrUnavailableError(ocrAvailability().reason);
  const res = await FormOcr.recognize(uri, level, []);
  return {
    engine: FormOcr.engine,
    width: res.width,
    height: res.height,
    lines: res.lines
      .filter((l) => l.text.trim())
      .map((l) => ({
        text: l.text,
        confidence: Number.isFinite(l.confidence) ? Math.min(1, Math.max(0, l.confidence)) : null,
        box: { x: l.x, y: l.y, width: l.width, height: l.height },
      })),
  };
}

/** Native engines free their resources after each call. */
export function releaseEngine() {}
