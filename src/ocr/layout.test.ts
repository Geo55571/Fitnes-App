import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { binarize, blobs, combineLayout, composeLines, findRuns, type ReadRun } from './layout';

const W = 400;
const H = 300;

/** A white screen with dark rectangles standing in for letters: [x, y, w, h]. */
function screen(rects: [number, number, number, number][]): Uint8Array {
  const g = new Uint8Array(W * H).fill(255);
  for (const [x, y, w, h] of rects) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * W + xx] = 0;
  return g;
}

/** Digit-like hollow boxes (fill well under the "solid block" limit). */
function digit(x: number, y: number, w: number, h: number): [number, number, number, number][] {
  const t = Math.max(3, Math.round(w / 5));
  return [
    [x, y, w, t],
    [x, y + h - t, w, t],
    [x, y, t, h],
    [x + w - t, y, t, h],
  ];
}

describe('watch screen layout reader', () => {
  // 8'37"  AVERAGE      (big digits with a pace's marks, small two-line label beside them)
  //        PACE
  const rects = [
    ...digit(20, 60, 30, 50), // 8
    [56, 60, 4, 14] as [number, number, number, number], // '
    ...digit(66, 60, 30, 50), // 3
    ...digit(102, 60, 30, 50), // 7
    [138, 60, 4, 14] as [number, number, number, number], // "
    [146, 60, 4, 14] as [number, number, number, number],
    // AVERAGE (7 small letters), PACE (4)
    ...Array.from({ length: 7 }, (_, i) => digit(160 + i * 15, 62, 11, 16)).flat(),
    ...Array.from({ length: 4 }, (_, i) => digit(160 + i * 15, 88, 11, 16)).flat(),
  ];
  const g = screen(rects);
  const runs = findRuns(blobs(binarize(g, W, H), W, H), W, H);

  it('keeps a pace’s marks with its digits and the label words apart', () => {
    assert.equal(runs.length, 3);
    const [value, average, pace] = runs;
    // The value run spans from the 8 to the closing quote…
    assert.ok(value.x <= 20 && value.x + value.w >= 150, `value run ${JSON.stringify(value)}`);
    // …and the label lines start after it.
    assert.ok(average.x >= 155 && pace.x >= 155);
    assert.ok(average.y < pace.y);
  });

  it('joins a value with the label lines beside it', () => {
    const texts = ['8\'37"', 'AVERAGE', 'PACE'];
    const read: ReadRun[] = runs.map((r, i) => ({ ...r, text: texts[i], confidence: 0.9 }));
    assert.deepEqual(
      composeLines(read).map((l) => l.text),
      ['8\'37" AVERAGE PACE'],
    );
  });

  it('does not hand a big value to a thin sliver (the screen edge) as its label', () => {
    const read: ReadRun[] = [
      { x: 5, y: 100, w: 3, h: 120, text: '|', confidence: 0.5 },
      { x: 30, y: 110, w: 200, h: 60, text: '23:53', confidence: 0.9 },
    ];
    assert.deepEqual(
      composeLines(read).map((l) => l.text),
      ['|', '23:53'],
    );
  });

  it('lets the sparse reading restore a lost colon and fill gaps', () => {
    const box = (x: number, y: number) => ({ x, y, width: 0.4, height: 0.08 });
    const out = combineLayout(
      [{ text: '3112.25', confidence: 0.46, box: box(0.1, 0.3) }],
      [
        { text: '31:12.25', confidence: 0.84, box: box(0.1, 0.3) },
        { text: '10:09', confidence: 0.96, box: box(0.6, 0.1) },
      ],
    );
    assert.deepEqual(
      out.map((l) => l.text),
      ['10:09', '31:12.25'],
    );
    // A blurred value the layout read lost a piece of; its label stays.
    const blurred = combineLayout(
      [
        { text: '):39.05', confidence: 0.72, box: box(0.1, 0.3) },
        { text: '52. ACTIVE KCAL', confidence: 0.67, box: { x: 0.1, y: 0.4, width: 0.6, height: 0.08 } },
      ],
      [
        { text: '19:39.05', confidence: 0.92, box: box(0.1, 0.3) },
        { text: '152"', confidence: 0.6, box: { x: 0.1, y: 0.4, width: 0.25, height: 0.08 } },
      ],
    );
    assert.deepEqual(
      blurred.map((l) => l.text),
      ['19:39.05', '152" ACTIVE KCAL'],
    );
  });
});
