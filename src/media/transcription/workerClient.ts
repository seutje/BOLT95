import { AppError } from "../../app/errors/AppError";
import type { WhisperModelDescriptor } from "../../domain/models/manifest";
import { runtimeAssetUrls } from "../../infrastructure/assets/urls";
import { getCachedModelBlob } from "../../infrastructure/storage/models";
import type {
  WhisperWorkerRequest,
  WhisperWorkerResponse,
  WhisperResultResponse,
} from "../../workers/protocol";
import { rawWhisperToTranscript } from "./words";
import type { TranscriptionProgress, TranscriptionResult } from "./types";

function deserializeFailure(
  message: Extract<WhisperWorkerResponse, { type: "whisper/failure" }>,
): AppError {
  return new AppError(message.error.code, message.error.message, {
    ...(message.error.technicalDetail ? { technicalDetail: message.error.technicalDetail } : {}),
    ...(message.error.recoveryAction ? { recoveryAction: message.error.recoveryAction } : {}),
  });
}

export class WhisperWorkerClient {
  private worker: Worker | null = null;

  async transcribe(options: {
    readonly model: WhisperModelDescriptor;
    readonly pcm: Float32Array;
    readonly durationMs: number;
    readonly language: string;
    readonly signal: AbortSignal;
    readonly onProgress?: (progress: TranscriptionProgress) => void;
  }): Promise<TranscriptionResult> {
    this.dispose();
    const modelBlob = await getCachedModelBlob(options.model.id);
    if (!modelBlob) {
      throw new AppError("INPUT_INVALID", "Selected model is not cached.", {
        recoveryAction: "Download or supply the model before transcribing.",
      });
    }
    this.worker = new Worker(new URL("../../workers/whisper.worker.ts", import.meta.url), {
      type: "module",
    });

    const abort = (): void => {
      this.worker?.terminate();
      this.worker = null;
    };
    options.signal.addEventListener("abort", abort, { once: true });
    try {
      const initId = crypto.randomUUID();
      await this.request(
        {
          type: "whisper/init",
          requestId: initId,
          wasmModuleUrl: runtimeAssetUrls.whisperModule(),
          wasmUrl: runtimeAssetUrls.whisperWasm(),
          model: await modelBlob.arrayBuffer(),
        },
        "whisper/ready",
        options.signal,
        options.onProgress,
      );
      if (options.signal.aborted)
        throw new AppError("JOB_CANCELLED", "Transcription was cancelled.");

      const runId = crypto.randomUUID();
      const result = await this.request(
        {
          type: "whisper/run",
          requestId: runId,
          pcm: options.pcm.buffer as ArrayBuffer,
          language: options.language,
        },
        "whisper/result",
        options.signal,
        options.onProgress,
        [options.pcm.buffer as ArrayBuffer],
      );
      return rawWhisperToTranscript({
        raw: (result as WhisperResultResponse).result,
        durationMs: options.durationMs,
        modelId: options.model.id,
      });
    } finally {
      options.signal.removeEventListener("abort", abort);
      this.dispose();
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private request<T extends WhisperWorkerResponse["type"]>(
    request: WhisperWorkerRequest,
    expectedType: T,
    signal: AbortSignal,
    onProgress?: (progress: TranscriptionProgress) => void,
    transfer: Transferable[] = [],
  ): Promise<Extract<WhisperWorkerResponse, { type: T }>> {
    if (!this.worker) {
      return Promise.reject(new Error("Whisper worker is not running."));
    }
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      const cleanup = (): void => {
        worker?.removeEventListener("message", listener);
        worker?.removeEventListener("error", abort);
        signal.removeEventListener("abort", abort);
      };
      const abort = (): void => {
        cleanup();
        reject(
          new AppError("JOB_CANCELLED", "Transcription was cancelled.", {
            recoveryAction: "Start transcription again when ready.",
          }),
        );
      };
      const listener = (event: MessageEvent<WhisperWorkerResponse>): void => {
        const message = event.data;
        if (message.requestId !== request.requestId) return;
        if (message.type === "whisper/progress") {
          onProgress?.(message.progress);
          return;
        }
        if (message.type === "whisper/failure") {
          cleanup();
          reject(deserializeFailure(message));
          return;
        }
        if (message.type === expectedType) {
          cleanup();
          resolve(message as Extract<WhisperWorkerResponse, { type: T }>);
        }
      };
      if (signal.aborted) {
        abort();
        return;
      }
      worker?.addEventListener("message", listener);
      worker?.addEventListener("error", abort, { once: true });
      signal.addEventListener("abort", abort, { once: true });
      worker?.postMessage(request, transfer);
    });
  }
}
