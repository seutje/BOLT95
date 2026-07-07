import type { TranscriptResult } from "../../domain/alignment/engine";
import type { WhisperModelDescriptor } from "../../domain/models/manifest";

export type TranscriptionLanguageMode = "auto" | "en" | "multilingual";

export interface TranscriptionModelChoice {
  readonly model: WhisperModelDescriptor;
  readonly reason: string;
}

export interface WhisperRawToken {
  readonly text: string;
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly probability: number;
}

export interface WhisperRawSegment {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly tokens: readonly WhisperRawToken[];
}

export interface WhisperRawResult {
  readonly languageId: number;
  readonly detectedLanguage?: string;
  readonly segments: readonly WhisperRawSegment[];
  readonly wasmHeapBytes: number;
  readonly peakPcmBytes: number;
}

export interface TranscriptionResult extends TranscriptResult {
  readonly raw: WhisperRawResult;
  readonly modelId: string;
}

export interface ModelCacheEntry {
  readonly id: string;
  readonly displayName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly storedAt: number;
  readonly suppliedByUser: boolean;
}

export type TranscriptionProgressPhase =
  "download" | "integrity" | "loading" | "processing" | "finalizing";

export interface TranscriptionProgress {
  readonly phase: TranscriptionProgressPhase;
  readonly message: string;
  readonly loadedBytes?: number;
  readonly totalBytes?: number;
}
