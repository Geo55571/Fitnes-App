/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Session } from '../domain/types';
import { createChunkedStorage, type KV } from './chunkedStorage';

function memoryKV() {
  const map = new Map<string, string>();
  const writes: string[][] = [];
  const kv: KV = {
    async getItem(k) {
      return map.get(k) ?? null;
    },
    async multiGet(keys) {
      return keys.map((k) => [k, map.get(k) ?? null] as const);
    },
    async multiSet(pairs) {
      writes.push(pairs.map(([k]) => k));
      pairs.forEach(([k, v]) => map.set(k, v));
    },
    async multiRemove(keys) {
      keys.forEach((k) => map.delete(k));
    },
  };
  return { kv, map, writes };
}

const s = (id: string, date: string): Session => ({
  id,
  personId: 'me',
  date,
  performedAt: `${date}T10:00:00Z`,
  category: 'bodyweight',
  entries: [{ id: `${id}e`, exerciseId: 'pushups', sets: [{ reps: 5 }] }],
  createdAt: '',
  updatedAt: '',
});

type St = { sessions: Session[]; name: string };

describe('chunked storage', () => {
  it('splits sessions by month and round-trips', async () => {
    const { kv, map } = memoryKV();
    const st = createChunkedStorage<St>(kv);
    await st.setItem('app', { state: { name: 'Sam', sessions: [s('a', '2026-08-31'), s('b', '2026-09-01'), s('c', '2026-09-30')] }, version: 1 });
    assert.deepEqual([...map.keys()].sort(), ['app:main', 'app:sessions:2026-08', 'app:sessions:2026-09']);
    const fresh = createChunkedStorage<St>(kv);
    const back = await fresh.getItem('app');
    assert.equal(back?.state.name, 'Sam');
    assert.deepEqual(back?.state.sessions.map((x) => x.id).sort(), ['a', 'b', 'c']);
    assert.equal(back?.version, 1);
  });

  it('rewrites only changed months and removes emptied ones', async () => {
    const { kv, map, writes } = memoryKV();
    const st = createChunkedStorage<St>(kv);
    const base = [s('a', '2026-08-31'), s('b', '2026-09-01')];
    await st.setItem('app', { state: { name: 'x', sessions: base }, version: 1 });
    writes.length = 0;
    await st.setItem('app', { state: { name: 'x', sessions: [...base, s('c', '2026-09-02')] }, version: 1 });
    // Only the changed month is written; the index (same months) is untouched.
    assert.deepEqual(writes, [['app:sessions:2026-09']]);
    await st.setItem('app', { state: { name: 'x', sessions: [s('b', '2026-09-01')] }, version: 1 });
    assert.equal(map.has('app:sessions:2026-08'), false);
  });

  it('coalesces rapid saves and keeps the newest state', async () => {
    const { kv } = memoryKV();
    const st = createChunkedStorage<St>(kv);
    const p1 = st.setItem('app', { state: { name: 'one', sessions: [] }, version: 1 });
    const p2 = st.setItem('app', { state: { name: 'two', sessions: [] }, version: 1 });
    const p3 = st.setItem('app', { state: { name: 'three', sessions: [] }, version: 1 });
    await Promise.all([p1, p2, p3]);
    const back = await createChunkedStorage<St>(kv).getItem('app');
    assert.equal(back?.state.name, 'three');
  });

  it('migrates a legacy single-record save', async () => {
    const { kv, map } = memoryKV();
    const legacy = memoryKV();
    legacy.map.set('app', JSON.stringify({ state: { name: 'old', sessions: [s('a', '2026-07-04')] }, version: 1 }));
    const back = await createChunkedStorage<St>(kv, legacy.kv).getItem('app');
    assert.equal(back?.state.name, 'old');
    assert.equal(map.has('app:sessions:2026-07'), true);
    assert.equal(legacy.map.has('app'), false);
  });
});
