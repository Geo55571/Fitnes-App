/**
 * On-device AI for the website: a small language model running on the phone's/computer's GPU
 * through WebGPU (WebLLM). It recognizes the type of workout from its name when the built-in
 * interpreter doesn't know it. Nothing is sent anywhere: the photo, the text and the answer
 * stay in the browser.
 *
 * - The runtime (web-llm.js) and its worker are served by this site from /ai.
 * - The model's weights are downloaded once, on request, from the official MLC model
 *   repository, and kept in the browser (IndexedDB) for offline use.
 * - Its answer is constrained by a grammar to one of the workout types (src/domain/aiReading.ts).
 */
import { create } from 'zustand';

import { ACTIVITY_GRAMMAR, classifyUserPrompt, CLASSIFY_SYSTEM_PROMPT, parseActivity } from '@/domain/aiReading';
import type { ScanActivity } from '@/domain/workoutScan';

import type { LocalAiState } from './types';

export type { LocalAiState, LocalAiStatus } from './types';

/** Model choice: the f16 build where the GPU supports it, otherwise the f32 build of the same model. */
const MODEL = {
  label: 'Qwen2.5 1.5B',
  f16: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', sizeMB: 880 },
  f32: { id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', sizeMB: 1060 },
};

type WebLLM = typeof import('@mlc-ai/web-llm');
type Engine = Awaited<ReturnType<WebLLM['CreateWebWorkerMLCEngine']>>;

export const useLocalAi = create<LocalAiState>(() => ({ status: 'checking', progress: 0, detail: null, model: null }));

const base = () => new URL('/ai/', window.location.origin).href;
// A runtime import of a file this site serves (kept out of the app bundle; bundlers can't follow it).
const importUrl = new Function('u', 'return import(u)') as (u: string) => Promise<WebLLM>;

let lib: Promise<WebLLM> | null = null;
const loadLib = () => (lib ??= importUrl(`${base()}web-llm.js`).catch((e) => ((lib = null), Promise.reject(e))));

let variant: { id: string; sizeMB: number } | null = null;

/** Works out whether this browser can run the model and whether it's downloaded. */
export async function refreshLocalAi(): Promise<void> {
  const s = useLocalAi.getState().status;
  if (s === 'downloading') return;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string>; limits: Record<string, number> } | null> } }).gpu;
  if (!gpu) {
    useLocalAi.setState({ status: 'unsupported', detail: 'This browser has no WebGPU, which the on-device AI needs. Use a current Chrome, Edge or Safari.' });
    return;
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error('no adapter');
    variant = adapter.features.has('shader-f16') ? MODEL.f16 : MODEL.f32;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (deviceMemory !== undefined && deviceMemory < 4) {
      useLocalAi.setState({ status: 'unsupported', detail: 'This device has too little memory for the on-device AI.', model: null });
      return;
    }
    const webllm = await loadLib();
    const cached = await webllm.hasModelInCache(variant.id, appConfig(webllm));
    useLocalAi.setState({
      status: cached ? 'ready' : 'absent',
      progress: cached ? 1 : 0,
      detail: null,
      model: { label: MODEL.label, sizeMB: variant.sizeMB },
    });
  } catch {
    useLocalAi.setState({ status: 'unsupported', detail: 'This device’s graphics chip can’t run the on-device AI.', model: null });
  }
}

const appConfig = (webllm: WebLLM) => ({ ...webllm.prebuiltAppConfig, cacheBackend: 'indexeddb' as const });

// ---------- engine ----------

let engine: Promise<Engine> | null = null;
let idle: ReturnType<typeof setTimeout> | null = null;

function startEngine(onProgress?: (p: number, text: string) => void): Promise<Engine> {
  engine ??= (async () => {
    const webllm = await loadLib();
    if (!variant) await refreshLocalAi();
    if (!variant) throw new Error('unsupported');
    const worker = new Worker(`${base()}worker.js`, { type: 'module' });
    return webllm.CreateWebWorkerMLCEngine(worker, variant.id, {
      appConfig: appConfig(webllm),
      initProgressCallback: (r) => onProgress?.(r.progress, r.text),
    });
  })().catch((e) => {
    engine = null;
    throw e;
  });
  return engine;
}

/** Frees the GPU memory. The model stays downloaded. */
export function releaseLocalAi(): void {
  if (idle) clearTimeout(idle);
  idle = null;
  const e = engine;
  engine = null;
  e?.then((x) => x.unload()).catch(() => {});
}

/** Downloads the model once (with progress) so it can be used offline. */
export async function downloadLocalAi(): Promise<void> {
  await refreshLocalAi();
  const st = useLocalAi.getState();
  if (st.status !== 'absent' && st.status !== 'error') return;
  useLocalAi.setState({ status: 'downloading', progress: 0, detail: 'Starting…' });
  try {
    await startEngine((p, text) => useLocalAi.setState({ progress: p, detail: /fetch|download/i.test(text) ? 'Downloading the model…' : 'Preparing…' }));
    useLocalAi.setState({ status: 'ready', progress: 1, detail: null });
    // Don't hold on to GPU memory until a photo actually needs the model.
    idle = setTimeout(releaseLocalAi, 30_000);
  } catch (e) {
    releaseLocalAi();
    const msg = e instanceof Error ? e.message : String(e);
    useLocalAi.setState({
      status: 'error',
      detail: /quota|storage/i.test(msg)
        ? 'Not enough storage space for the model.'
        : /fetch|network/i.test(msg)
          ? 'The download was interrupted. Check your connection and try again.'
          : 'The on-device AI couldn’t start on this device.',
    });
  }
}

export async function removeLocalAi(): Promise<void> {
  releaseLocalAi();
  const webllm = await loadLib();
  if (variant) await webllm.deleteModelAllInfoInCache(variant.id, appConfig(webllm));
  useLocalAi.setState({ status: 'absent', progress: 0, detail: null });
}

/**
 * Asks the model what kind of workout a name is ("Zumba", "Leg day", "Trčanje na traci").
 * Returns null if the model isn't downloaded or can't answer.
 */
export async function classifyWithLocalAi(name: string): Promise<ScanActivity | null> {
  if (!name.trim()) return null;
  // After a reload the status is unknown until checked (the model may well be downloaded).
  if (useLocalAi.getState().status === 'checking') await refreshLocalAi();
  if (useLocalAi.getState().status !== 'ready') return null;
  if (idle) clearTimeout(idle);
  try {
    const e = await startEngine();
    const res = await e.chat.completions.create({
      messages: [
        { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
        { role: 'user', content: classifyUserPrompt(name) },
      ],
      // The answer can only be one of the activity words.
      response_format: { type: 'grammar', grammar: ACTIVITY_GRAMMAR },
      temperature: 0,
      max_tokens: 8,
    });
    return parseActivity(res.choices[0]?.message?.content ?? '');
  } catch {
    return null;
  } finally {
    idle = setTimeout(releaseLocalAi, 120_000);
  }
}
