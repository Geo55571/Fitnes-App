/**
 * Layout reader for watch screens, on plain greyscale arrays (testable without a browser).
 *
 * Apple Watch (and most sport watches) print a big value with a small two-line label beside it:
 *
 *     8'37" AVERAGE        23:53 TIME
 *           PACE                 IN ZONE
 *
 * Tesseract's own layout analysis breaks on that mix of sizes: it splits "8'37"" at the
 * apostrophe and reads the label's first line as part of the number. So we find the text
 * ourselves — connected blobs of ink, grouped into runs of similar height — read each run alone
 * (the engine does that), and join each value with the small labels beside it into one line.
 */
import type { Rect } from './imagePrep';
import type { OcrBox, RecognizedTextBlock } from './types';

export interface Blob {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ink pixels. */
  n: number;
}

/** A run of text of one size: a value ("8'37"", "3.14MI") or one line of a label ("AVERAGE"). */
export interface Run extends Rect {
  blobs: number;
}

/**
 * Dark-on-light text → ink mask. Local threshold (ink is clearly darker than its surroundings)
 * so uneven light across a photo doesn't swallow text.
 */
export function binarize(g: Uint8Array, w: number, h: number): Uint8Array {
  const r = Math.max(8, Math.round(Math.min(w, h) / 16));
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const local = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const v = g[y * w + x];
      out[y * w + x] = v < 160 && v < local - 12 ? 1 : 0;
    }
  }
  return out;
}

/** Connected blobs of ink (8-connected). */
export function blobs(mask: Uint8Array, w: number, h: number): Blob[] {
  const seen = new Uint8Array(w * h);
  const out: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let n = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
  }
  return out;
}

const vOverlap = (a: Rect, b: Rect) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/**
 * Groups blobs into runs of text. Letters of similar height on one line with small gaps form a
 * run; small marks (":", ".", "'", """) join the run they sit in or right beside. The screen's
 * edge, bars and solid blocks are dropped.
 */
export function findRuns(all: Blob[], w: number, h: number): Run[] {
  const minH = Math.max(4, h * 0.012);
  const items = all.filter((b) => {
    if (b.w > 0.5 * w || b.h > 0.3 * h) return false; // bezel, bars, pills
    if (b.h < minH && b.w < minH) return true; // maybe a dot of ":" or "."; kept as a mark
    const fill = b.n / (b.w * b.h);
    if (fill > 0.75 && b.w > 3 * b.h && b.w > 0.1 * w) return false; // progress bars
    return !(fill > 0.8 && b.w > 0.8 * b.h && b.h > 0.04 * h); // solid blocks (zone bar)
  });
  // Dots (of ":" and ".") and dashes are marks; they join a run after the letters are grouped.
  const isDot = (b: Blob) => b.h < minH * 1.2 || (b.h < 0.6 * b.w && b.h < 0.03 * h);
  // The "'" and """ of a pace are thin strokes high up beside a big digit. They're as tall as the
  // small label next to them, so they must be told apart by shape before grouping by size.
  const big = items.filter((b) => !isDot(b));
  const host = new Map<Blob, Blob>();
  for (const m of big) {
    if (m.w > 0.5 * m.h) continue;
    const d = big.find((b) => {
      if (b === m || b.h < 2 * m.h) return false;
      if (m.y < b.y - 0.2 * b.h || m.y + m.h > b.y + 0.55 * b.h) return false;
      const gap = m.x > b.x + b.w ? m.x - (b.x + b.w) : b.x > m.x + m.w ? b.x - (m.x + m.w) : 0;
      return gap <= 0.25 * b.h;
    });
    if (d) host.set(m, d);
  }
  // The second stroke of a """ sits beside the first: it belongs to the same digit.
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of big) {
      if (host.has(m) || m.w > 0.6 * m.h) continue;
      for (const [s, b] of host) {
        const gap = m.x > s.x + s.w ? m.x - (s.x + s.w) : s.x > m.x + m.w ? s.x - (m.x + m.w) : 0;
        if (m.h > 0.6 * s.h && m.h < 1.6 * s.h && vOverlap(m, s) > 0.5 * Math.min(m.h, s.h) && gap <= 0.6 * s.h) {
          host.set(m, b);
          changed = true;
          break;
        }
      }
    }
  }
  const letters = big.filter((b) => !host.has(b)).sort((a, b) => a.x - b.x);
  const marks = items.filter(isDot);
  type Group = Rect & { blobs: number; hs: number[]; members: Set<Blob> };
  const groups: Group[] = [];
  for (const b of letters) {
    // Join the group whose last letter is close, on the same line and of similar height.
    let best: Group | null = null;
    let bestGap = Infinity;
    for (const g of groups) {
      const gh = median(g.hs);
      const ratio = b.h / gh;
      const gap = b.x - (g.x + g.w);
      if (ratio < 0.6 || ratio > 1.67) continue;
      if (vOverlap(g, b) < 0.5 * Math.min(g.h, b.h)) continue;
      if (gap > 0.9 * Math.max(gh, b.h) || gap < -0.5 * b.w) continue;
      if (gap < bestGap) {
        best = g;
        bestGap = gap;
      }
    }
    if (best) {
      Object.assign(best, union(best, b));
      best.blobs++;
      best.hs.push(b.h);
      best.members.add(b);
    } else groups.push({ x: b.x, y: b.y, w: b.w, h: b.h, blobs: 1, hs: [b.h], members: new Set([b]) });
  }
  for (const [m, b] of host) {
    // A stroke can sit between two digits whose host is itself a stroke's host; follow to a letter.
    const g = groups.find((x) => x.members.has(b) || x.members.has(host.get(b)!));
    if (g) {
      Object.assign(g, union(g, m));
      g.blobs++;
    }
  }
  // Marks join the run they belong to: ":" and "." and the "'" in "8'37" sit inside it; the
  // closing quote of a pace (") sits just after it, high up. Short label words ("IN", "HR") further
  // right or lower down stay labels.
  const target = (m: Rect): Group | null => {
    let best: Group | null = null;
    let bestD = Infinity;
    for (const g of groups) {
      if (g === (m as Group)) continue;
      const gh = median(g.hs);
      if (m.h > 0.7 * gh || m.y < g.y - 0.25 * gh || m.y + m.h > g.y + g.h + 0.15 * gh) continue;
      const inside = m.x + m.w / 2 > g.x && m.x + m.w / 2 < g.x + g.w;
      const d = m.x - (g.x + g.w);
      // A closing quote is narrow; a blurred label word ("ACTIVE" as one blob) is not.
      const after = d >= -0.1 * gh && d <= 0.3 * gh && m.y + m.h <= g.y + 0.55 * gh && m.w <= 0.35 * gh;
      if (!inside && !after) continue;
      const dd = inside ? 0 : d;
      if (dd < bestD) {
        best = g;
        bestD = dd;
      }
    }
    return best;
  };
  const absorbed = new Set<Group>();
  for (const g of [...groups].sort((a, b) => a.h - b.h)) {
    if (g.blobs > 2 || absorbed.has(g)) continue;
    const t = target(g);
    if (t && !absorbed.has(t)) {
      Object.assign(t, union(t, g));
      t.blobs += g.blobs;
      absorbed.add(g);
    }
  }
  for (const m of marks) {
    const t = target(m);
    if (t && !absorbed.has(t)) {
      Object.assign(t, union(t, m));
      t.blobs++;
    }
  }
  const runs = groups.filter((g) => !absorbed.has(g));
  // A run needs some substance: one letter-sized blob at least, not a lone dot.
  return runs
    .filter((g) => g.h >= minH * 1.5 && (g.blobs > 1 || g.w > 0.4 * g.h))
    .map(({ x, y, w: rw, h: rh, blobs: n }) => ({ x, y, w: rw, h: rh, blobs: n }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export interface ReadRun extends Rect {
  text: string;
  confidence: number;
}

/**
 * Joins each value with the small label lines beside it ("8'37"" + "AVERAGE" + "PACE" →
 * "8'37" AVERAGE PACE"), and returns the screen's lines top to bottom.
 */
export function composeLines(runs: ReadRun[]): ReadRun[] {
  const used = new Set<ReadRun>();
  const out: ReadRun[] = [];
  const byY = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  // Big values first, so they claim their labels before a label is taken as a line of its own.
  for (const r of [...runs].sort((a, b) => b.h - a.h)) {
    if (used.has(r)) continue;
    used.add(r);
    // Small runs to the right whose middle is within this run's height: its label lines.
    // (A thin sliver — the screen's edge — has no labels.)
    const label = (r.w < 0.4 * r.h ? [] : byY)
      .filter((o) => {
        if (used.has(o) || o.h > 0.6 * r.h) return false;
        const mid = o.y + o.h / 2;
        const gap = o.x - (r.x + r.w);
        return mid > r.y - 0.1 * r.h && mid < r.y + r.h * 1.15 && gap > -0.1 * r.h && gap < 1.2 * r.h;
      })
      .sort((a, b) => a.y - b.y);
    // Label lines line up on the left, one under the other.
    const stack: ReadRun[] = [];
    for (const o of label) {
      if (stack.length && Math.abs(o.x - stack[0].x) > 0.6 * r.h) continue;
      stack.push(o);
    }
    stack.forEach((o) => used.add(o));
    const parts = [r, ...stack];
    out.push({
      ...parts.reduce<Rect>((a, b) => union(a, b), r),
      text: parts.map((p) => p.text.trim()).filter(Boolean).join(' '),
      confidence: Math.min(...parts.map((p) => p.confidence)),
    });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

const digitsOf = (s: string) => s.replace(/\D/g, '');
const boxArea = (b: OcrBox) => Math.max(1e-9, b.width * b.height);
function inter(a: OcrBox, b: OcrBox): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Combines the layout reading of a screen with Tesseract's own sparse reading of it. The layout
 * lines lead (they keep values with their labels). The sparse reading repairs a value whose
 * punctuation the layout read lost ("3112.25" → "31:12.25": same digits, but with the colon), and
 * adds what the layout reader didn't find at all.
 */
export function combineLayout(layout: RecognizedTextBlock[], sparse: RecognizedTextBlock[]): RecognizedTextBlock[] {
  const out = layout.map((l) => ({ ...l }));
  for (const s of sparse) {
    if (!s.box) continue;
    const hits = out.filter((l) => l.box && inter(l.box, s.box!) > 0.5 * boxArea(s.box!));
    if (!hits.length) {
      if (!out.some((l) => l.box && inter(l.box, s.box!) > 0.3 * boxArea(s.box!))) out.push({ ...s });
      continue;
    }
    const sv = s.text.trim().split(/\s+/)[0];
    const sd = digitsOf(sv);
    for (const l of hits) {
      const [lv, ...rest] = l.text.trim().split(/\s+/);
      const d = digitsOf(lv);
      if (!d) continue;
      // Same digits, but with the colon the layout read lost.
      const colon = d.length >= 3 && d === sd && sv.includes(':') && !lv.includes(':');
      // The same digits and more, read about as surely: the layout read lost a piece
      // (":39.05" of "19:39.05", "52." of "152").
      const fuller = sd.length > d.length && sd.includes(d) && (s.confidence ?? 0) >= (l.confidence ?? 0) - 0.1;
      if (colon || fuller) l.text = [sv, ...rest].join(' ');
    }
  }
  return out.sort((a, b) => (a.box && b.box ? a.box.y - b.box.y || a.box.x - b.box.x : 0));
}
