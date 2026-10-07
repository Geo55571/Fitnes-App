// Web: browser storage. (expo-sqlite on web is still alpha and needs special server headers.)
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KV } from './chunkedStorage';

export const kv: KV = AsyncStorage;
