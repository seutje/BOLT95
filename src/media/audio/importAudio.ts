import { AppError } from "../../app/errors/AppError";
import type { BackgroundJobState } from "../../app/jobs/types";
import { restoreWaveform, type AudioWorkerResponse } from "../../workers/protocol";
import { AUDIO_SAMPLE_RATE, type AudioImportResult } from "./types";
import {
  DEFAULT_AUDIO_LIMITS,
  estimateProcessingRisk,
  validateAudioFile,
  validateDecodedDuration,
  type AudioImportLimits,
} from "./validation";

export interface ImportAudioOptions {
  readonly signal: AbortSignal;
  readonly limits?: AudioImportLimits;
  readonly onProgress?: (job: BackgroundJobState) => void;
}

function cancelled(): AppError {
  return new AppError("JOB_CANCELLED", "Audio preprocessing was cancelled.", {
    recoveryAction: "Choose an MP3 to start again.",
  });
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(cancelled());
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export async function importAudio(
  file: File,
  { signal, limits = DEFAULT_AUDIO_LIMITS, onProgress = () => undefined }: ImportAudioOptions,
): Promise<AudioImportResult> {
  await validateAudioFile(file, limits);
  if (signal.aborted) throw cancelled();
  const jobId = crypto.randomUUID();
  onProgress({
    id: jobId,
    type: "decode",
    phase: "preparing",
    progress: 0,
    message: "Reading MP3…",
  });

  let context: AudioContext | undefined;
  let worker: Worker | undefined;
  let objectUrl: string | undefined;
  try {
    const sourceBytes = await withAbort(file.arrayBuffer(), signal);
    if (signal.aborted) throw cancelled();
    context = new AudioContext();
    onProgress({
      id: jobId,
      type: "decode",
      phase: "loading",
      progress: 0.08,
      message: "Decoding MP3…",
    });
    let decoded: AudioBuffer;
    try {
      decoded = await withAbort(context.decodeAudioData(sourceBytes), signal);
    } catch (cause) {
      if (cause instanceof AppError && cause.code === "JOB_CANCELLED") throw cause;
      throw new AppError("AUDIO_DECODE_FAILED", "The browser could not decode this MP3.", {
        technicalDetail: cause instanceof Error ? cause.message : "decodeAudioData rejected",
        recoveryAction: "Re-encode the file as a standard MP3 or choose another file.",
        cause,
      });
    }
    const durationMs = Math.round(decoded.duration * 1000);
    validateDecodedDuration(durationMs, limits);
    const channels = Array.from(
      { length: decoded.numberOfChannels },
      (_, index) => decoded.getChannelData(index).slice().buffer,
    );
    await context.close();
    context = undefined;
    if (signal.aborted) throw cancelled();
    // Chromium detaches the buffer passed to decodeAudioData. Re-read after decode has released
    // it, so fingerprinting does not require two live full-file copies.
    const fingerprintBytes = await withAbort(file.arrayBuffer(), signal);

    const completed = await new Promise<Extract<AudioWorkerResponse, { type: "audio/complete" }>>(
      (resolve, reject) => {
        worker = new Worker(new URL("../../workers/audio.worker.ts", import.meta.url), {
          type: "module",
        });
        const abort = () => {
          worker?.terminate();
          reject(cancelled());
        };
        signal.addEventListener("abort", abort, { once: true });
        worker.addEventListener("message", (event: MessageEvent<AudioWorkerResponse>) => {
          const response = event.data;
          if (response.jobId !== jobId) return;
          if (response.type === "audio/progress") {
            onProgress({
              id: jobId,
              type: "decode",
              phase: "processing",
              progress: 0.1 + response.progress * 0.9,
              message: response.message,
            });
          } else if (response.type === "audio/complete") {
            signal.removeEventListener("abort", abort);
            resolve(response);
          } else {
            signal.removeEventListener("abort", abort);
            reject(new AppError(response.error.code, response.error.message, response.error));
          }
        });
        worker.addEventListener("error", (event) => {
          signal.removeEventListener("abort", abort);
          reject(
            new AppError("UNEXPECTED_FAILURE", "The audio worker stopped unexpectedly.", {
              technicalDetail: event.message,
              recoveryAction: "Retry the import.",
            }),
          );
        });
        worker.postMessage(
          {
            type: "audio/process",
            jobId,
            sourceRate: decoded.sampleRate,
            channels,
            sourceBytes: fingerprintBytes,
          },
          [...channels, fingerprintBytes],
        );
      },
    );
    worker?.terminate();
    worker = undefined;
    objectUrl = URL.createObjectURL(file);
    const riskEstimate = estimateProcessingRisk(file.size, durationMs, limits);
    onProgress({
      id: jobId,
      type: "decode",
      phase: "completed",
      progress: 1,
      message: "Audio ready.",
    });
    return {
      file,
      objectUrl,
      format: "MP3",
      durationMs,
      sampleRate: AUDIO_SAMPLE_RATE,
      sampleCount: new Float32Array(completed.pcm).length,
      fingerprint: completed.fingerprint,
      waveform: restoreWaveform(completed.waveform),
      pcm: new Float32Array(completed.pcm),
      risk: riskEstimate.risk,
      riskReasons: riskEstimate.reasons,
    };
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  } finally {
    worker?.terminate();
    if (context && context.state !== "closed") {
      // Some browsers defer close() until an in-flight decoder settles. Start cleanup without
      // making cancellation wait for that browser-owned decoder.
      void context.close().catch(() => undefined);
    }
  }
}

export function releaseAudioImport(audio: AudioImportResult): void {
  URL.revokeObjectURL(audio.objectUrl);
}
