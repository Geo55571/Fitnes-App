import { NativeModule, requireOptionalNativeModule } from 'expo';

/** One recognized line. Box values are 0…1 of the upright image, origin top-left. */
export interface NativeOcrLine {
  text: string;
  /** 0…1 as reported by the engine. */
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeOcrResult {
  width: number;
  height: number;
  lines: NativeOcrLine[];
}

declare class FormOcrModule extends NativeModule<{}> {
  /** 'apple-vision' or 'google-mlkit'. */
  readonly engine: string;
  /** `uri` must be a local file. `level`: 'accurate' | 'fast'. Empty `languages` = automatic. */
  recognize(uri: string, level: 'accurate' | 'fast', languages: string[]): Promise<NativeOcrResult>;
}

/**
 * The native OCR module, or null where it isn't compiled in (Expo Go, the web build).
 * It only exists in a development or store build: `npx expo run:ios|android` or `eas build`.
 */
export default requireOptionalNativeModule<FormOcrModule>('FormOcr');
