// Native: SQLite-backed key-value store (a proper on-device database, one row per key).
import Storage from 'expo-sqlite/kv-store';

import type { KV } from './chunkedStorage';

export const kv: KV = Storage;
