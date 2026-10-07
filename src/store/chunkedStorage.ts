import type { PersistStorage, StorageValue } from 'zustand/middleware';

import type { Session } from '@/domain/types';

/** The subset of AsyncStorage / expo-sqlite kv-store this module needs. */
export interface KV {
  getItem(key: string): Promise<string | null>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

const mainKey = (name: string) => `${name}:main`;
const chunkKey = (name: string, month: string) => `${name}:sessions:${month}`;

interface MainRecord<S> {
  state: Omit<S, 'sessions'> & { sessionMonths: string[] };
  version?: number;
}

/**
 * Persists app state with the session history split into one record per month.
 *
 * - Saving rewrites only months that changed, so a large history stays cheap to save
 *   and no single record grows without bound (Android limits rows to ~2 MB).
 * - Month records and the index are written in one batch, chunks before the index.
 * - Saves are serialized and coalesced: only the newest state is written.
 * - A previous single-record save (`legacy`) is migrated on first load.
 */
export function createChunkedStorage<S extends { sessions: Session[] }>(
  kv: KV,
  legacy?: Pick<KV, 'getItem' | 'multiRemove'>,
): PersistStorage<S> {
  // Last JSON written or read per key, to skip unchanged months.
  const known = new Map<string, string>();
  let latest: { name: string; value: StorageValue<S> } | null = null;
  let running: Promise<void> | null = null;

  async function write(name: string, value: StorageValue<S>) {
    const { sessions, ...rest } = value.state;
    const byMonth = new Map<string, Session[]>();
    for (const s of sessions) {
      const m = s.date.slice(0, 7);
      const list = byMonth.get(m);
      if (list) list.push(s);
      else byMonth.set(m, [s]);
    }
    const months = [...byMonth.keys()].sort();
    const pairs: [string, string][] = [];
    for (const m of months) {
      const key = chunkKey(name, m);
      const json = JSON.stringify(byMonth.get(m));
      if (known.get(key) !== json) pairs.push([key, json]);
    }
    const main: MainRecord<S> = { state: { ...(rest as Omit<S, 'sessions'>), sessionMonths: months }, version: value.version };
    const mainJson = JSON.stringify(main);
    if (known.get(mainKey(name)) !== mainJson) pairs.push([mainKey(name), mainJson]);

    const stale = [...known.keys()].filter(
      (k) => k.startsWith(`${name}:sessions:`) && !months.includes(k.slice(`${name}:sessions:`.length)),
    );

    if (pairs.length) await kv.multiSet(pairs);
    pairs.forEach(([k, v]) => known.set(k, v));
    if (stale.length) {
      await kv.multiRemove(stale);
      stale.forEach((k) => known.delete(k));
    }
  }

  const storage: PersistStorage<S> = {
    async getItem(name) {
      const mainRaw = await kv.getItem(mainKey(name));
      if (!mainRaw) {
        const legacyRaw = legacy ? await legacy.getItem(name) : null;
        if (!legacyRaw) return null;
        const parsed = JSON.parse(legacyRaw) as StorageValue<S>;
        await write(name, parsed);
        await legacy!.multiRemove([name]);
        return parsed;
      }
      const main = JSON.parse(mainRaw) as MainRecord<S>;
      known.set(mainKey(name), mainRaw);
      const keys = (main.state.sessionMonths ?? []).map((m) => chunkKey(name, m));
      const rows = keys.length ? await kv.multiGet(keys) : [];
      const sessions: Session[] = [];
      for (const [key, raw] of rows) {
        if (!raw) continue;
        known.set(key, raw);
        sessions.push(...(JSON.parse(raw) as Session[]));
      }
      const { sessionMonths: _months, ...rest } = main.state;
      return { state: { ...rest, sessions } as unknown as S, version: main.version };
    },

    setItem(name, value) {
      latest = { name, value };
      if (!running) {
        running = (async () => {
          try {
            while (latest) {
              const job = latest;
              latest = null;
              await write(job.name, job.value);
            }
          } finally {
            running = null;
          }
        })();
      }
      return running;
    },

    async removeItem(name) {
      const keys = [...known.keys()].filter((k) => k.startsWith(`${name}:`));
      await kv.multiRemove([...new Set([...keys, mainKey(name)])]);
      keys.forEach((k) => known.delete(k));
    },
  };
  return storage;
}
