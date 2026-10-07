import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { enhance, findScreen, mean, mergeLines } from './imagePrep';

/** A 200×300 light photo with a dark 120×150 "screen" at (40, 80) and some light text pixels on it. */
function watchPhoto() {
  const w = 200;
  const h = 300;
  const g = new Uint8Array(w * h).fill(200);
  for (let y = 80; y < 230; y++) for (let x = 40; x < 160; x++) g[y * w + x] = 15;
  // Three lines of text: light strokes with dark gaps, like real glyphs.
  for (const top of [100, 140, 180]) for (let y = top; y < top + 20; y++) for (let x = 50; x < 150; x += 3) g[y * w + x] = 230;
  return { g, w, h };
}

describe('OCR image preparation', () => {
  it('finds the dark watch screen in a light photo', () => {
    const { g, w, h } = watchPhoto();
    const r = findScreen(g, w, h)!;
    assert.ok(r, 'screen found');
    assert.ok(Math.abs(r.x - 40) <= 4 && Math.abs(r.y - 80) <= 6, JSON.stringify(r));
    assert.ok(Math.abs(r.x + r.w - 160) <= 4 && Math.abs(r.y + r.h - 230) <= 6, JSON.stringify(r));
    assert.ok(mean(g, w, r) < 80);
  });

  it('leaves screenshots and documents alone', () => {
    assert.equal(findScreen(new Uint8Array(100 * 100).fill(10), 100, 100), null); // all dark: a screenshot
    assert.equal(findScreen(new Uint8Array(100 * 100).fill(240), 100, 100), null); // white page
  });

  it('inverts and stretches contrast', () => {
    const { g, w } = watchPhoto();
    const out = enhance(g, w, { x: 40, y: 80, w: 120, h: 150 }, true);
    assert.equal(out[0], 255); // dark screen → white
    assert.equal(out[(100 - 80) * 120 + (50 - 40)], 0); // light text → black
  });

  it('merges two passes, keeping the more confident reading of the same line', () => {
    const box = (y: number) => ({ x: 0.1, y, width: 0.5, height: 0.05 });
    const a = [
      { text: '152"', confidence: 0.47, box: box(0.4) },
      { text: '37LAPS', confidence: 0.8, box: box(0.6) },
    ];
    const b = [
      { text: '152 ACTIVE KCAL', confidence: 0.85, box: box(0.405) },
      { text: '37LAPS', confidence: 0.82, box: box(0.6) },
      { text: 'TOTAL', confidence: 0.6, box: box(0.5) },
    ];
    assert.deepEqual(
      mergeLines(a, b).map((l) => l.text),
      ['152 ACTIVE KCAL', '37LAPS', 'TOTAL'],
    );
    // A confident scrap in the same place doesn't replace a real reading.
    assert.deepEqual(
      mergeLines([{ text: '925m', confidence: 0.6, box: box(0.7) }], [{ text: '-', confidence: 0.95, box: box(0.7) }]).map((l) => l.text),
      ['925m'],
    );
  });
});
