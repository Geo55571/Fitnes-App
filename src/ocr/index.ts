/**
 * OCR service: reads text and numbers from an image entirely on the device.
 *
 *   image → downsized upright JPEG → engine (Apple Vision / ML Kit / Tesseract in the browser)
 *         → lines with confidence and boxes → parsed numbers, units, times and dates
 *
 * No network calls are made for any of this; see engine.ts / engine.web.ts.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { parseLines } from '@/domain/ocrParser';

import { runEngine } from './engine';
import type { OcrLevel, OcrProgress, OcrResult } from './types';

export { ocrAvailability, OcrUnavailableError, releaseEngine } from './engine';
export type * from './types';

/**
 * Longest side the engine sees. Phone photos are 3000–4000 px; text stays legible well below
 * that, and smaller images are much faster. "fast" trades a little accuracy for speed
 * (meant for live camera frames).
 */
const MAX_SIDE: Record<OcrLevel, number> = { accurate: 2048, fast: 1280 };

export interface RecognizeOptions {
  level?: OcrLevel;
  /** Known size of the source image (skips resizing when already small). */
  size?: { width: number; height: number };
  onProgress?: (p: OcrProgress) => void;
}

/**
 * Downsizes and re-encodes the image. Re-encoding also bakes in EXIF orientation, so every
 * engine receives an upright image.
 */
async function prepareImage(uri: string, level: OcrLevel, size?: { width: number; height: number }) {
  const ctx = ImageManipulator.manipulate(uri);
  const max = MAX_SIDE[level];
  if (!size || Math.max(size.width, size.height) > max) {
    if (size) ctx.resize(size.width >= size.height ? { width: max } : { height: max });
  }
  const rendered = await ctx.renderAsync();
  // A downsize needs the real size; if it wasn't known, check it now.
  let image = rendered;
  if (!size && Math.max(rendered.width, rendered.height) > max) {
    image = await ImageManipulator.manipulate(uri)
      .resize(rendered.width >= rendered.height ? { width: max } : { height: max })
      .renderAsync();
    rendered.release();
  }
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  image.release();
  return saved;
}

/** Recognizes the text in a local image and returns it structured. Runs off the UI thread. */
export async function recognizeText(uri: string, options: RecognizeOptions = {}): Promise<OcrResult> {
  const level = options.level ?? 'accurate';
  const started = Date.now();
  options.onProgress?.({ status: 'Preparing the image…', progress: null });
  const prepared = await prepareImage(uri, level, options.size);
  const out = await runEngine(prepared.uri, level, options.onProgress);
  if (Platform.OS === 'web' && prepared.uri.startsWith('blob:')) URL.revokeObjectURL(prepared.uri);

  // Reading order: top to bottom, and left to right for lines on the same row.
  const blocks = [...out.lines].sort((a, b) => {
    if (!a.box || !b.box) return 0;
    const dy = a.box.y + a.box.height / 2 - (b.box.y + b.box.height / 2);
    const sameRow = Math.abs(dy) < Math.min(a.box.height, b.box.height) / 2;
    return sameRow ? a.box.x - b.box.x : dy;
  });
  const parsed = parseLines(blocks);
  return {
    fullText: blocks.map((b) => b.text).join('\n'),
    textBlocks: blocks,
    numbers: parsed.numbers,
    dates: parsed.dates,
    engine: out.engine,
    icon: out.icon ?? null,
    level,
    imageSize: { width: out.width, height: out.height },
    durationMs: Date.now() - started,
  };
}
