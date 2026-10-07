/**
 * Recognizes the workout icon on a watch screen (the runner, cyclist, swimmer… in the round badge
 * at the top left of Apple Watch's workout views) — the only sign of the workout type there.
 *
 * Works on the same greyscale image as the layout reader (dark text on light): the badge is a
 * round mid-grey disc, the figure the dark shape inside it. The figure is scaled to a 32×32 mask
 * and compared with reference masks taken from Apple's own screenshots (iconTemplates.ts).
 */
import type { ScanActivity } from '@/domain/workoutScan';

import { blobs, type Blob } from './layout';
import { ICON_TEMPLATES } from './iconTemplates';

export const ICON_SIZE = 32;

export interface IconMatch {
  activity: ScanActivity;
  /** 0…1 shape similarity of the best reference. */
  score: number;
}

/** Below this the shape isn't clearly one of the references. */
const MIN_SCORE = 0.62;
/** The best activity must beat the next-best other activity by this much. */
const MIN_MARGIN = 0.12;

/** Finds the round badge in the top-left of a screen and returns the figure in it as a mask. */
export function findIconGlyph(g: Uint8Array, w: number, h: number): Uint8Array | null {
  // Everything darker than the background: text, the badge disc and the figure on it. A photo's
  // background is greyer than a screenshot's, so try a few levels and keep the roundest disc.
  let disc: Blob | null = null;
  let roundness = Infinity;
  for (const level of [225, 210, 195, 180]) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < g.length; i++) mask[i] = g[i] < level ? 1 : 0;
    for (const b of blobs(mask, w, h)) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (cx > 0.5 * w || cy > 0.45 * h) continue;
      if (b.w < 0.08 * w || b.w > 0.35 * w || b.h / b.w < 0.8 || b.h / b.w > 1.25) continue;
      const fill = b.n / (b.w * b.h);
      if (fill < 0.6 || fill > 0.92) continue;
      // A filled circle covers π/4 of its square box.
      const off = Math.abs(fill - Math.PI / 4) + Math.abs(Math.log(b.h / b.w));
      if (off < roundness) {
        disc = b;
        roundness = off;
      }
    }
  }
  if (!disc) return null;

  // Pixels inside the disc (a little in from its edge), split into disc and figure by Otsu.
  const cx = disc.x + disc.w / 2;
  const cy = disc.y + disc.h / 2;
  const r = (Math.min(disc.w, disc.h) / 2) * 0.88;
  const inside: number[] = [];
  const hist = new Uint32Array(256);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      inside.push(y * w + x);
      hist[g[y * w + x]]++;
    }
  }
  const t = otsu(hist, inside.length);
  const dark = inside.filter((i) => g[i] < t);
  const share = dark.length / inside.length;
  if (share < 0.04 || share > 0.5) return null;
  return normalize(
    dark.map((i) => [i % w, Math.floor(i / w)]),
  );
}

/** Scales a set of pixels to fit a centred ICON_SIZE × ICON_SIZE mask, keeping its proportions. */
export function normalize(points: number[][]): Uint8Array | null {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const side = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) + 1;
  const s = (ICON_SIZE - 2) / side;
  const ox = (ICON_SIZE - (Math.max(...xs) - x0 + 1) * s) / 2;
  const oy = (ICON_SIZE - (Math.max(...ys) - y0 + 1) * s) / 2;
  const out = new Uint8Array(ICON_SIZE * ICON_SIZE);
  for (const [x, y] of points) {
    // Each source pixel covers a small square of the mask (so thin strokes stay connected).
    const mx0 = Math.floor(ox + (x - x0) * s);
    const my0 = Math.floor(oy + (y - y0) * s);
    const mx1 = Math.max(mx0, Math.ceil(ox + (x - x0 + 1) * s) - 1);
    const my1 = Math.max(my0, Math.ceil(oy + (y - y0 + 1) * s) - 1);
    for (let my = my0; my <= my1; my++) for (let mx = mx0; mx <= mx1; mx++) if (mx >= 0 && my >= 0 && mx < ICON_SIZE && my < ICON_SIZE) out[my * ICON_SIZE + mx] = 1;
  }
  return out;
}

function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      t = i + 0.5;
    }
  }
  return t;
}

/**
 * Shape similarity: how much the two figures overlap (intersection over union), allowing one
 * pixel of offset. Plain overlap tells figures apart well — measured on photos of Apple Watch
 * screens, the right icon scores 0.81–0.86 and the best wrong one at most 0.55; looser measures
 * (counting near misses as hits) made a runner and a walker look alike.
 */
export function similarity(a: Uint8Array, b: Uint8Array): number {
  const n = ICON_SIZE;
  let best = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      let inter = 0;
      let union = 0;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const yy = y + dy;
          const xx = x + dx;
          const av = a[y * n + x];
          const bv = yy >= 0 && xx >= 0 && yy < n && xx < n ? b[yy * n + xx] : 0;
          if (av && bv) inter++;
          if (av || bv) union++;
        }
      if (union) best = Math.max(best, inter / union);
    }
  return best;
}

export function decodeMask(hex: string): Uint8Array {
  const out = new Uint8Array(ICON_SIZE * ICON_SIZE);
  for (let i = 0; i < out.length; i++) out[i] = (parseInt(hex[i >> 2], 16) >> (3 - (i & 3))) & 1;
  return out;
}

export function encodeMask(m: Uint8Array): string {
  let s = '';
  for (let i = 0; i < m.length; i += 4) s += ((m[i] << 3) | (m[i + 1] << 2) | (m[i + 2] << 1) | m[i + 3]).toString(16);
  return s;
}

let decoded: { activity: ScanActivity; mask: Uint8Array }[] | null = null;

/** The workout type whose reference icon this figure matches clearly, or null. */
export function matchIcon(glyph: Uint8Array): IconMatch | null {
  decoded ??= ICON_TEMPLATES.map((t) => ({ activity: t.activity, mask: decodeMask(t.mask) }));
  const best = new Map<ScanActivity, number>();
  for (const t of decoded) best.set(t.activity, Math.max(best.get(t.activity) ?? 0, similarity(glyph, t.mask)));
  const ranked = [...best].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (!first || first[1] < MIN_SCORE || (second && first[1] - second[1] < MIN_MARGIN)) return null;
  return { activity: first[0], score: first[1] };
}

/** Finds and recognizes the workout icon on a screen image. */
export function recognizeIcon(g: Uint8Array, w: number, h: number): IconMatch | null {
  const glyph = findIconGlyph(g, w, h);
  return glyph ? matchIcon(glyph) : null;
}
