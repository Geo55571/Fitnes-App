/**
 * Image preparation for the browser OCR engine (Tesseract), on plain greyscale arrays so it can
 * be tested without a browser. Phone photos of a watch are hard for Tesseract: small light text
 * on a black screen, surrounded by a bright strap and background. So we find the screen, crop to
 * it, flip it to dark-on-light and stretch the contrast.
 */
import type { OcrBox, RecognizedTextBlock } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) | 0;
  return g;
}

/**
 * Brightest channel per pixel. Watch screens print in colour on black (yellow time, green pace,
 * red heart rate): by brightness red text is dim, but its strongest channel is as bright as white.
 */
export function toMaxGray(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
  return g;
}

export function mean(g: Uint8Array, w: number, r?: Rect): number {
  const { x, y, w: rw, h: rh } = r ?? { x: 0, y: 0, w, h: g.length / w };
  let s = 0;
  for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) s += g[yy * w + xx];
  return s / Math.max(1, rw * rh);
}

/** Longest run of indexes where `ok(i)` holds, tolerating short gaps. */
function longestRun(n: number, ok: (i: number) => boolean, maxGap: number): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  let last = -1;
  for (let i = 0; i <= n; i++) {
    const hit = i < n && ok(i);
    if (hit) {
      if (start < 0 || i - last > maxGap + 1) start = i;
      last = i;
    }
    if ((!hit || i === n) && start >= 0 && i - last > maxGap) {
      if (!best || last - start > best[1] - best[0]) best = [start, last];
      start = -1;
    }
  }
  if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last];
  return best;
}

/**
 * Finds a large dark rectangle (a watch or phone screen) in a lighter photo.
 * Returns null when there isn't one, or when the whole picture is the screen (a screenshot).
 */
export function findScreen(g: Uint8Array, w: number, h: number, darkBelow = 70): Rect | null {
  const rowDark = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) if (g[y * w + x] < darkBelow) c++;
    rowDark[y] = c / w;
  }
  // Rows of text on the screen are lighter; tolerate them as gaps.
  const rows = longestRun(h, (y) => rowDark[y] >= 0.3, Math.max(2, Math.round(h * 0.06)));
  if (!rows) return null;
  const [y0, y1] = rows;
  const rh = y1 - y0 + 1;
  const colDark = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = y0; y <= y1; y++) if (g[y * w + x] < darkBelow) c++;
    colDark[x] = c / rh;
  }
  const cols = longestRun(w, (x) => colDark[x] >= 0.5, Math.max(2, Math.round(w * 0.02)));
  if (!cols) return null;
  const [x0, x1] = cols;
  const rw = x1 - x0 + 1;
  if (rh < 0.2 * h || rw < 0.2 * w || rw * rh < 0.1 * w * h) return null;
  if (rh > 0.95 * h && rw > 0.95 * w) return null;
  const mx = Math.round(w * 0.015);
  const my = Math.round(h * 0.015);
  const x = Math.max(0, x0 - mx);
  const y = Math.max(0, y0 - my);
  return { x, y, w: Math.min(w, x1 + mx + 1) - x, h: Math.min(h, y1 + my + 1) - y };
}

/**
 * Copies a region, optionally inverting it, and stretches its contrast so the darkest 2 %
 * become black and the brightest 2 % white.
 */
export function enhance(g: Uint8Array, w: number, r: Rect, invert: boolean): Uint8Array {
  const out = new Uint8Array(r.w * r.h);
  const hist = new Uint32Array(256);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const v = g[(r.y + y) * w + r.x + x];
      const p = invert ? 255 - v : v;
      out[y * r.w + x] = p;
      hist[p]++;
    }
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= q * out.length) return i;
    }
    return 255;
  };
  const lo = pct(0.02);
  const hi = Math.max(lo + 1, pct(0.98));
  const scale = 255 / (hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, (out[i] - lo) * scale));
  return out;
}

// ---------- merging two OCR passes ----------

const area = (b: OcrBox) => b.width * b.height;
function overlap(a: OcrBox, b: OcrBox): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(area(a), area(b));
}
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\d]/gu, '');

/**
 * Combines lines from two OCR passes over the same image (boxes in the same coordinates):
 * where both found a line in the same place, the more confident one wins; everything else is kept.
 */
export function mergeLines(primary: RecognizedTextBlock[], extra: RecognizedTextBlock[]): RecognizedTextBlock[] {
  const out = [...primary];
  for (const line of extra) {
    const n = norm(line.text);
    if (!n) continue;
    const i = out.findIndex((o) => (o.box && line.box ? overlap(o.box, line.box) > 0.5 : norm(o.text) === n));
    if (i < 0) {
      if (!out.some((o) => norm(o.text) === n)) out.push(line);
      continue;
    }
    // Prefer the reading with more real characters; confidence decides between similar ones,
    // so a confident scrap ("-") never replaces a real line ("925m").
    const keep = out[i];
    const nk = norm(keep.text).length;
    const cl = line.confidence ?? 0;
    const ck = keep.confidence ?? 0;
    if ((n.length >= nk && cl > ck + 0.1) || (n.length > nk * 1.5 && cl >= ck - 0.1)) out[i] = line;
  }
  return out;
}
