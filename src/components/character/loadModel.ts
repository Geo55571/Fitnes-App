import { Asset } from 'expo-asset';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { getAvatarModel, type AvatarModelId } from './models';
import { readAssetBytes } from './readAsset';

/** Minimal UTF-8 TextDecoder for engines that lack one (GLTFLoader needs it to read the GLB JSON chunk). */
function ensureTextDecoder() {
  const g = globalThis as { TextDecoder?: unknown };
  if (typeof g.TextDecoder !== 'undefined') return;
  class Utf8Decoder {
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return '';
      const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = '';
      for (let i = 0; i < bytes.length; ) {
        const b = bytes[i++];
        let cp: number;
        if (b < 0x80) cp = b;
        else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
        else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        out += String.fromCodePoint(cp);
      }
      return out;
    }
  }
  g.TextDecoder = Utf8Decoder;
}

const cache = new Map<AvatarModelId, Promise<GLTF>>();

/** Loads and parses a model once; callers clone the scene per view. */
export function loadAvatarModel(id: AvatarModelId): Promise<GLTF> {
  const hit = cache.get(id);
  if (hit) return hit;
  const promise = (async () => {
    ensureTextDecoder();
    const asset = Asset.fromModule(getAvatarModel(id).source);
    await asset.downloadAsync();
    const buffer = await readAssetBytes(asset.localUri ?? asset.uri);
    return new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
  })();
  // Don't cache failures, so a later attempt can retry.
  promise.catch(() => cache.delete(id));
  cache.set(id, promise);
  return promise;
}
