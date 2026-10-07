import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ICON_TEMPLATES } from './iconTemplates';
import { decodeMask, encodeMask, ICON_SIZE, matchIcon, recognizeIcon, similarity } from './icons';

const N = ICON_SIZE;
const shift = (m: Uint8Array, dx: number, dy: number) => {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y * N + x] && x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N) out[(y + dy) * N + x + dx] = 1;
  return out;
};

describe('workout icon recognition', () => {
  it('stores masks without loss', () => {
    for (const t of ICON_TEMPLATES) assert.equal(encodeMask(decodeMask(t.mask)), t.mask);
  });

  it('recognizes every reference icon, also nudged a pixel or two', () => {
    for (const t of ICON_TEMPLATES) {
      const m = decodeMask(t.mask);
      assert.equal(matchIcon(m)?.activity, t.activity, t.source);
      assert.equal(matchIcon(shift(m, 1, 1))?.activity, t.activity, `${t.source}, shifted`);
    }
  });

  it('tells the figures apart', () => {
    // Different activities overlap far less than the match threshold.
    for (const a of ICON_TEMPLATES)
      for (const b of ICON_TEMPLATES)
        if (a.activity !== b.activity) assert.ok(similarity(decodeMask(a.mask), decodeMask(b.mask)) < 0.6, `${a.source} vs ${b.source}`);
  });

  it('does not guess on shapes that are no workout icon', () => {
    const square = new Uint8Array(N * N);
    for (let y = 4; y < 28; y++) for (let x = 4; x < 28; x++) square[y * N + x] = 1;
    assert.equal(matchIcon(square), null);
  });

  it('finds the badge on a screen and reads its figure', () => {
    // A light screen (dark text on light, as the engine prepares it) with a grey disc top left
    // and the cycling figure drawn dark inside it.
    const w = 400;
    const h = 400;
    const g = new Uint8Array(w * h).fill(250);
    const cx = 80;
    const cy = 80;
    const r = 50;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y * w + x] = 170;
    const bike = decodeMask(ICON_TEMPLATES.find((t) => t.activity === 'cycling')!.mask);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (bike[y * N + x]) for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) g[(cy - N + y * 2 + yy) * w + cx - N + x * 2 + xx] = 20;
    assert.equal(recognizeIcon(g, w, h)?.activity, 'cycling');
  });
});
