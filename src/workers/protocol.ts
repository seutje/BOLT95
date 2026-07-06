import type { SerializedAppError } from "../app/errors/AppError";
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

export function restoreWaveform(response: AudioCompleteResponse["waveform"]): WaveformData {
  return {
    durationMs: response.durationMs,
    samplesPerSecond: response.samplesPerSecond,
    min: new Float32Array(response.min),
    max: new Float32Array(response.max),
    rms: new Float32Array(response.rms),
  };
}
