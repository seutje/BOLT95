export interface TranscriptToken {
  readonly text: string;
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly probability: number;
}

export interface TranscriptSegment {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly tokens: readonly TranscriptToken[];
}

export interface TranscriptProofResult {
  readonly languageId: number;
  readonly segments: readonly TranscriptSegment[];
  readonly wasmHeapBytes: number;
}

export type WhisperRequest =
  | {
      readonly type: "INIT";
      readonly requestId: string;
      readonly wasmModuleUrl: string;
      readonly modelUrl: string;
      readonly expectedModelBytes: number;
    }
  | {
      readonly type: "RUN";
      readonly requestId: string;
      readonly pcm: ArrayBuffer;
      readonly language: string;
    }
  | { readonly type: "DISPOSE"; readonly requestId: string };

export type WhisperResponse =
  | { readonly type: "READY"; readonly requestId: string; readonly wasmHeapBytes: number }
  | {
      readonly type: "PROGRESS";
      readonly requestId: string;
      readonly phase: "download" | "loading" | "processing";
      readonly loadedBytes?: number;
      readonly totalBytes?: number;
    }
  | { readonly type: "RESULT"; readonly requestId: string; readonly result: TranscriptProofResult }
  | { readonly type: "DISPOSED"; readonly requestId: string }
  | { readonly type: "ERROR"; readonly requestId: string; readonly message: string };
