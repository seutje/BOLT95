import type { SerializedAppError } from "../app/errors/AppError";
import type {
  AlignmentOptions,
  AlignmentResult,
  TranscriptResult,
} from "../domain/alignment/engine";
import type { CanonicalLyrics } from "../domain/lyrics/canonical";
import type { TranscriptionProgress, WhisperRawResult } from "../media/transcription/types";
import type { WaveformData } from "../media/audio/types";

export interface AudioProcessRequest {
  readonly type: "audio/process";
  readonly jobId: string;
  readonly sourceRate: number;
  readonly channels: ArrayBuffer[];
  readonly sourceBytes: ArrayBuffer;
}

export interface AudioProgressResponse {
  readonly type: "audio/progress";
  readonly jobId: string;
  readonly progress: number;
  readonly message: string;
}

export interface AudioCompleteResponse {
  readonly type: "audio/complete";
  readonly jobId: string;
  readonly pcm: ArrayBuffer;
  readonly fingerprint: string;
  readonly waveform: {
    readonly durationMs: number;
    readonly samplesPerSecond: number;
    readonly min: ArrayBuffer;
    readonly max: ArrayBuffer;
    readonly rms: ArrayBuffer;
  };
}

export interface AudioFailureResponse {
  readonly type: "audio/failure";
  readonly jobId: string;
  readonly error: SerializedAppError;
}

export type AudioWorkerRequest = AudioProcessRequest;
export type AudioWorkerResponse =
  AudioProgressResponse | AudioCompleteResponse | AudioFailureResponse;

export interface WhisperInitRequest {
  readonly type: "whisper/init";
  readonly requestId: string;
  readonly wasmModuleUrl: string;
  readonly wasmUrl: string;
  readonly model: ArrayBuffer;
}

export interface WhisperRunRequest {
  readonly type: "whisper/run";
  readonly requestId: string;
  readonly pcm: ArrayBuffer;
  readonly language: string;
}

export interface WhisperCancelRequest {
  readonly type: "whisper/cancel";
  readonly requestId: string;
}

export interface WhisperDisposeRequest {
  readonly type: "whisper/dispose";
  readonly requestId: string;
}

export interface WhisperReadyResponse {
  readonly type: "whisper/ready";
  readonly requestId: string;
  readonly wasmHeapBytes: number;
}

export interface WhisperProgressResponse {
  readonly type: "whisper/progress";
  readonly requestId: string;
  readonly progress: TranscriptionProgress;
}

export interface WhisperResultResponse {
  readonly type: "whisper/result";
  readonly requestId: string;
  readonly result: WhisperRawResult;
}

export interface WhisperCancelledResponse {
  readonly type: "whisper/cancelled";
  readonly requestId: string;
}

export interface WhisperDisposedResponse {
  readonly type: "whisper/disposed";
  readonly requestId: string;
}

export interface WhisperFailureResponse {
  readonly type: "whisper/failure";
  readonly requestId: string;
  readonly error: SerializedAppError;
}

export type WhisperWorkerRequest =
  WhisperInitRequest | WhisperRunRequest | WhisperCancelRequest | WhisperDisposeRequest;

export type WhisperWorkerResponse =
  | WhisperReadyResponse
  | WhisperProgressResponse
  | WhisperResultResponse
  | WhisperCancelledResponse
  | WhisperDisposedResponse
  | WhisperFailureResponse;

export interface AlignmentRunRequest {
  readonly type: "alignment/run";
  readonly requestId: string;
  readonly canonical: CanonicalLyrics;
  readonly transcript: TranscriptResult;
  readonly options?: AlignmentOptions;
}

export interface AlignmentProgressResponse {
  readonly type: "alignment/progress";
  readonly requestId: string;
  readonly message: string;
}

export interface AlignmentResultResponse {
  readonly type: "alignment/result";
  readonly requestId: string;
  readonly result: AlignmentResult;
}

export interface AlignmentFailureResponse {
  readonly type: "alignment/failure";
  readonly requestId: string;
  readonly error: SerializedAppError;
}

export type AlignmentWorkerRequest = AlignmentRunRequest;
export type AlignmentWorkerResponse =
  AlignmentProgressResponse | AlignmentResultResponse | AlignmentFailureResponse;

export function restoreWaveform(response: AudioCompleteResponse["waveform"]): WaveformData {
  return {
    durationMs: response.durationMs,
    samplesPerSecond: response.samplesPerSecond,
    min: new Float32Array(response.min),
    max: new Float32Array(response.max),
    rms: new Float32Array(response.rms),
  };
}
