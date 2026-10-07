/**
 * Browser OCR engine: Tesseract (WebAssembly) running in a Web Worker inside the page.
 * Every file it needs — library, worker, engine and English model — is served by this site
 * from /ocr (see scripts/copy-ocr-assets.mjs). No CDN, and the image never leaves the browser.
 * After the first use the model is kept in the browser's storage, so reading works offline.
 */
import type { Worker as TesseractWorker } from 'tesseract.js';

import { parseLine } from '@/domain/ocrParser';

import { enhance, findScreen, mean, mergeLines, toGray, toMaxGray } from './imagePrep';
import { recognizeIcon } from './icons';
import { binarize, blobs, combineLayout, composeLines, findRuns, type ReadRun } from './layout';
import type { EngineOutput, OcrLevel, OcrProgress, RecognizedIcon, RecognizedTextBlock } from './types';

export class OcrUnavailableError extends Error {}

interface TesseractGlobal {
  createWorker: typeof import('tesseract.js').createWorker;
}

const base = () => new URL('/ocr/', window.location.origin).href;

export function ocrAvailability(): { available: boolean; reason?: string } {
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    return { available: false, reason: 'This browser can’t run the text reader. Try a current version of Chrome, Safari, Firefox or Edge.' };
  }
  return { available: true };
}

// ---------- loading ----------

let libPromise: Promise<TesseractGlobal> | null = null;

/** Loads the Tesseract.js library from this site, once. */
function loadLibrary(): Promise<TesseractGlobal> {
  const existing = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
  if (existing) return Promise.resolve(existing);
  libPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base()}tesseract.min.js`;
    script.async = true;
    script.onload = () => {
      const lib = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
      if (lib) resolve(lib);
      else reject(new OcrUnavailableError('The text reader didn’t load.'));
    };
    script.onerror = () => {
      libPromise = null;
      script.remove();
      reject(new OcrUnavailableError('The text reader couldn’t be loaded. Check your connection once, then it works offline.'));
    };
    document.head.appendChild(script);
  });
  return libPromise;
}

const STATUS: Record<string, string> = {
  'loading tesseract core': 'Starting the text reader…',
  'initializing tesseract': 'Starting the text reader…',
  'loading language traineddata': 'Loading the English model…',
  'loading language traineddata (from cache)': 'Loading the English model…',
  'initializing api': 'Preparing…',
  'recognizing text': 'Reading text…',
};

let worker: Promise<TesseractWorker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let progressListener: ((p: OcrProgress) => void) | undefined;

function getWorker(): Promise<TesseractWorker> {
  worker ??= loadLibrary()
    .then((lib) =>
      lib.createWorker('eng', 1 /* OEM.LSTM_ONLY */, {
        workerPath: `${base()}worker.min.js`,
        corePath: base(),
        langPath: `${base()}lang`,
        gzip: true,
        // Keep the model in IndexedDB so later scans (and offline use) don't need the network.
        cacheMethod: 'write',
        logger: (m) => progressListener?.({ status: STATUS[m.status] ?? 'Reading text…', progress: typeof m.progress === 'number' ? m.progress : null }),
        errorHandler: () => {},
      }),
    )
    .catch((e) => {
      worker = null;
      throw e instanceof OcrUnavailableError ? e : new OcrUnavailableError('The text reader couldn’t start in this browser.');
    });
  return worker;
}

/** Shuts the worker down (frees its memory). The next scan starts a new one. */
export function releaseEngine() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const w = worker;
  worker = null;
  w?.then((x) => x.terminate()).catch(() => {});
}

// ---------- image preparation ----------

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image couldn’t be opened.'));
    img.src = uri;
  });
}

/** One OCR pass: how to build its greyscale image, and where that sits in the original. */
interface Pass {
  /** Built only when the pass runs, so skipped passes cost nothing. */
  make: () => HTMLCanvasElement;
  /** Region of the original image, as fractions. */
  region: { x: number; y: number; w: number; h: number };
  /** Tesseract's page modes, or our own watch-screen layout reader. */
  psm: '3' | '11' | 'layout';
  /** Runs only if the passes before it found too few numbers. */
  fallback: boolean;
}

/** Enough lines with numbers that a workout summary was clearly read. */
const ENOUGH_NUMBER_LINES = 3;
/** Units of workout values (not "26°" water temperature or a "93%" battery). */
const WORKOUT_UNITS = new Set(['km', 'mi', 'm', 'yd', 'ft', 'kcal', 'bpm', 'mph', 'km/h', 'min', 'h']);

function toCanvas(px: Uint8Array, w: number, h: number, longSide: number): HTMLCanvasElement {
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const ctx = src.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0, j = 0; i < px.length; i++, j += 4) {
    img.data[j] = img.data[j + 1] = img.data[j + 2] = px[i];
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Tesseract reads best when characters are ~30–60 px tall: scale small crops up and big photos down.
  const s = longSide / Math.max(w, h);
  if (Math.abs(s - 1) < 0.1) return src;
  const out = document.createElement('canvas');
  out.width = Math.round(w * s);
  out.height = Math.round(h * s);
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, 0, 0, out.width, out.height);
  src.width = src.height = 0;
  return out;
}

/**
 * Builds the passes: a watch/phone screen found in a photo is cropped, flipped to dark-on-light
 * and read as sparse text; the whole image is read as a page. If those find few numbers (glare,
 * odd framing, a screen the detector missed), the whole image is read once more with the opposite
 * brightness as sparse text. Native engines don't need this.
 */
async function preparePasses(uri: string, level: OcrLevel): Promise<{ passes: Pass[]; width: number; height: number }> {
  const img = await loadImage(uri);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('The image couldn’t be prepared.');
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, W, H).data;
  const gray = toGray(rgba, W, H);
  c.width = c.height = 0;

  const full = { x: 0, y: 0, w: W, h: H };
  const whole = { x: 0, y: 0, w: 1, h: 1 };
  const fullSide = Math.min(2000, Math.max(W, H) * 1.5);
  const dark = mean(gray, W) < 110;
  const screen = findScreen(gray, W, H);
  const passes: Pass[] = [];
  if (screen) {
    passes.push({
      make: () => toCanvas(enhance(gray, W, screen, mean(gray, W, screen) < 110), screen.w, screen.h, 1600),
      region: { x: screen.x / W, y: screen.y / H, w: screen.w / W, h: screen.h / H },
      psm: '11',
      fallback: false,
    });
  }
  // With a screen found, the whole image is only a backup (it mostly adds strap and table noise).
  const fullPass: Pass = { make: () => toCanvas(enhance(gray, W, full, dark), W, H, fullSide), region: whole, psm: '3', fallback: !!screen };
  if (!screen) passes.push(fullPass);
  // A watch screen (found in a photo, or a dark screenshot of one): read its layout too.
  const area = screen ?? (dark ? full : null);
  if (area) {
    passes.push({
      make: () => {
        const max = toMaxGray(rgba, W, H);
        return toCanvas(enhance(max, W, area, mean(max, W, area) < 110), area.w, area.h, LAYOUT_SIDE);
      },
      region: { x: area.x / W, y: area.y / H, w: area.w / W, h: area.h / H },
      psm: 'layout',
      fallback: false,
    });
  }
  if (screen) passes.push(fullPass);
  if (level === 'accurate') {
    passes.push({ make: () => toCanvas(enhance(gray, W, full, !dark), W, H, fullSide), region: whole, psm: '11', fallback: true });
  }
  return { passes, width: W, height: H };
}

/**
 * Scraps from textures and reflections: mostly symbols ('"3°00" 22" 2" 2"'), or words read with
 * almost no confidence ('RAR RIA LR'). Lines with digits are kept longer — the numbers matter most.
 * Backup passes see the whole photo (strap, table, glare), so their word scraps must be surer.
 */
function isNoise(text: string, confidence: number, backup: boolean): boolean {
  const t = text.trim();
  if (!t) return true;
  const alnum = (t.match(/[\p{L}\d]/gu) ?? []).length;
  if (!alnum) return true;
  if (!/\d/.test(t) && confidence < (backup ? 0.5 : 0.3)) return true;
  return confidence < 0.6 && alnum / t.replace(/\s/g, '').length < 0.65;
}

/** Long side of the image the layout reader works on: big watch digits end up ~80 px tall. */
const LAYOUT_SIDE = 1000;
/** Height each run is scaled to before it's read: Tesseract's sweet spot. */
const RUN_HEIGHT = 56;
/** A screen has a dozen runs; more means a busy page, where the cost isn't worth it. */
const MAX_RUNS = 40;

/**
 * Reads a screen run by run (see layout.ts) and joins values with their labels; also recognizes
 * the workout icon in its corner (see icons.ts).
 */
async function readLayout(w: TesseractWorker, canvas: HTMLCanvasElement): Promise<{ lines: ReadRun[]; icon: RecognizedIcon | null }> {
  const cw = canvas.width;
  const ch = canvas.height;
  const px = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, cw, ch).data;
  const g = new Uint8Array(cw * ch);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = px[i];
  const icon = recognizeIcon(g, cw, ch);
  const runs = findRuns(blobs(binarize(g, cw, ch), cw, ch), cw, ch);
  if (!runs.length || runs.length > MAX_RUNS) return { lines: [], icon };
  await w.setParameters({ tessedit_pageseg_mode: '7' as never, user_defined_dpi: '300', debug_file: '/dev/null' } as never);
  const crop = document.createElement('canvas');
  const cctx = crop.getContext('2d')!;
  const read: ReadRun[] = [];
  for (const r of runs) {
    const pad = Math.round(r.h * 0.3);
    const x0 = Math.max(0, r.x - pad);
    const y0 = Math.max(0, r.y - pad);
    const sw = Math.min(cw, r.x + r.w + pad) - x0;
    const sh = Math.min(ch, r.y + r.h + pad) - y0;
    const s = RUN_HEIGHT / r.h;
    crop.width = Math.max(1, Math.round(sw * s));
    crop.height = Math.max(1, Math.round(sh * s));
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(canvas, x0, y0, sw, sh, 0, 0, crop.width, crop.height);
    const { data } = await w.recognize(crop);
    const text = data.text.replace(/\s+/g, ' ').trim();
    const confidence = Math.min(1, Math.max(0, data.confidence / 100));
    // Icons, bars and dots read as junk: keep numbers, and words read with confidence.
    const alnum = (text.match(/[\p{L}\d]/gu) ?? []).length;
    if (!alnum || (!/\d/.test(text) && (confidence < 0.6 || alnum < 2))) continue;
    read.push({ ...r, text, confidence });
  }
  crop.width = crop.height = 0;
  return { lines: composeLines(read), icon };
}

// ---------- recognition ----------

let queue: Promise<unknown> = Promise.resolve();

export function runEngine(uri: string, level: OcrLevel, onProgress?: (p: OcrProgress) => void): Promise<EngineOutput> {
  // One job at a time on the shared worker.
  const job = queue.then(async () => {
    if (idleTimer) clearTimeout(idleTimer);
    progressListener = onProgress;
    onProgress?.({ status: 'Starting the text reader…', progress: null });
    try {
      const { passes, width, height } = await preparePasses(uri, level);
      const w = await getWorker();
      let lines: RecognizedTextBlock[] = [];
      let icon: RecognizedIcon | null = null;
      // Only confident lines count: a blurry photo still "finds" numbers, just wrong ones. A page of
      // text that read cleanly (many lines, few numbers) doesn't need a backup pass either.
      const confident = () => lines.filter((l) => (l.confidence ?? 0) >= 0.7);
      // A workout reading needs a whole time or a value with a unit among them, too: a blurred
      // "19:39.05" read confidently as "):39.05" is no time.
      const readWell = () => {
        const sure = confident();
        if (sure.length >= 8) return true;
        const parsed = sure.map((l) => parseLine(l.text).numbers);
        return (
          parsed.filter((n) => n.length).length >= ENOUGH_NUMBER_LINES &&
          parsed.flat().some((n) => n.kind === 'time' || (n.kind === 'measurement' && WORKOUT_UNITS.has(n.unit!)))
        );
      };
      let haveLayout = false;
      for (const pass of passes) {
        if (pass.fallback && readWell()) continue;
        const canvas = pass.make();
        const cw = canvas.width;
        const ch = canvas.height;
        const r = pass.region;
        // Back to the original image's coordinates.
        const toBox = (x0: number, y0: number, x1: number, y1: number) => ({
          x: r.x + (x0 / cw) * r.w,
          y: r.y + (y0 / ch) * r.h,
          width: ((x1 - x0) / cw) * r.w,
          height: ((y1 - y0) / ch) * r.h,
        });
        let found: RecognizedTextBlock[];
        if (pass.psm === 'layout') {
          const layout = await readLayout(w, canvas);
          icon = layout.icon;
          found = layout.lines.map((l) => ({ text: l.text, confidence: l.confidence, box: toBox(l.x, l.y, l.x + l.w, l.y + l.h) }));
        } else {
          // A fixed resolution keeps Tesseract from guessing it (and logging about it).
          // debug_file silences Tesseract's chatter ("Detected 45 diacritics") in the console.
          await w.setParameters({ tessedit_pageseg_mode: pass.psm as never, user_defined_dpi: '300', debug_file: '/dev/null' } as never);
          const { data } = await w.recognize(canvas, {}, { text: true, blocks: true });
          found = (data.blocks ?? [])
            .flatMap((b) => b.paragraphs)
            .flatMap((p) => p.lines)
            .map((l) => ({
              text: l.text.replace(/\s+$/g, '').replace(/\n/g, ' '),
              confidence: Math.min(1, Math.max(0, l.confidence / 100)),
              box: toBox(l.bbox.x0, l.bbox.y0, l.bbox.x1, l.bbox.y1),
            }))
            .filter((l) => !isNoise(l.text, l.confidence, pass.fallback));
        }
        if ((globalThis as { __ocrDebug?: boolean }).__ocrDebug) console.log(`OCR pass ${pass.psm}${pass.fallback ? ' (backup)' : ''}:`, found.map((l) => `${l.text} (${Math.round((l.confidence ?? 0) * 100)})`).join(' | '));
        // The layout reading leads once there is one; other passes only repair and fill gaps.
        if (pass.psm === 'layout') lines = combineLayout(found, lines);
        else lines = haveLayout ? combineLayout(lines, found) : lines.length ? mergeLines(lines, found) : found;
        haveLayout ||= pass.psm === 'layout' && found.length > 0;
        canvas.width = canvas.height = 0; // release the bitmap
      }
      if ((globalThis as { __ocrDebug?: boolean }).__ocrDebug) console.log('OCR icon:', icon ? `${icon.activity} ${icon.score.toFixed(2)}` : 'none');
      return { engine: 'tesseract-wasm', width, height, lines, icon };
    } finally {
      progressListener = undefined;
      // Free the worker's memory after a minute without scans.
      idleTimer = setTimeout(releaseEngine, 60_000);
    }
  });
  queue = job.catch(() => {});
  return job;
}
