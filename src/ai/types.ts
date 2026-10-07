export type LocalAiStatus =
  /** Still checking what this device can do. */
  | 'checking'
  /** This device/browser can't run the model (no WebGPU, too little memory, or the phone app). */
  | 'unsupported'
  /** Can run it, but the model isn't downloaded yet. */
  | 'absent'
  | 'downloading'
  /** Downloaded and ready to use offline. */
  | 'ready'
  | 'error';

export interface LocalAiState {
  status: LocalAiStatus;
  /** 0…1 while downloading. */
  progress: number;
  /** Human-readable detail: why unsupported, download step, or error. */
  detail: string | null;
  /** Name and download size of the model this device would use. */
  model: { label: string; sizeMB: number } | null;
}
