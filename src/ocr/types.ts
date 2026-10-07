import type { RecognizedDate, RecognizedNumber } from '@/domain/ocrParser';
import type { ScanActivity } from '@/domain/workoutScan';

export type { NumberKind, RecognizedDate, RecognizedNumber } from '@/domain/ocrParser';

/**
 * 'accurate': best results for photos (default).
 * 'fast': lower latency, meant for live camera frames.
 */
export type OcrLevel = 'accurate' | 'fast';

/** Position in the upright image, as fractions 0…1, origin top-left. */
export interface OcrBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecognizedTextBlock {
  text: string;
  /** 0…1, or null when the engine doesn't report it. */
  confidence: number | null;
  box: OcrBox | null;
}

/** A workout type recognized from the icon on a watch screen (web engine only, for now). */
export interface RecognizedIcon {
  activity: ScanActivity;
  /** 0…1 shape similarity. */
  score: number;
}

export interface OcrResult {
  /** All recognized lines, top to bottom, joined with newlines. */
  fullText: string;
  /** One block per recognized line. */
  textBlocks: RecognizedTextBlock[];
  numbers: RecognizedNumber[];
  dates: RecognizedDate[];
  /** 'apple-vision' | 'google-mlkit' | 'tesseract-wasm'. */
  engine: string;
  level: OcrLevel;
  /** The workout icon, when the photo shows a watch screen with one. */
  icon: RecognizedIcon | null;
  /** Size of the image the engine read (after downsizing). */
  imageSize: { width: number; height: number };
  durationMs: number;
}

/** What an engine returns before parsing. */
export interface EngineOutput {
  engine: string;
  width: number;
  height: number;
  lines: RecognizedTextBlock[];
  icon?: RecognizedIcon | null;
}

export interface OcrProgress {
  /** 0…1 when known. */
  progress: number | null;
  status: string;
}
