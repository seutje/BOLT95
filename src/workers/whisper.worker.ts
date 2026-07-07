/// <reference lib="webworker" />

import { AppError, serializeAppError } from "../app/errors/AppError";
import type {
  WhisperInitRequest,
  WhisperRunRequest,
  WhisperWorkerRequest,
  WhisperWorkerResponse,
} from "./protocol";

interface WhisperModule {
  readonly HEAPU8: Uint8Array;
  readonly HEAPF32: Float32Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  _bolt95_init(model: number, size: number): number;
  _bolt95_dispose(): void;
  _bolt95_run(pcm: number, samples: number, language: number): number;
  _bolt95_segment_count(): number;
  _bolt95_segment_text(segment: number): number;
  _bolt95_segment_t0(segment: number): number;
  _bolt95_segment_t1(segment: number): number;
  _bolt95_token_count(segment: number): number;
  _bolt95_token_text(segment: number, token: number): number;
  _bolt95_token_t0(segment: number, token: number): number;
  _bolt95_token_t1(segment: number, token: number): number;
  _bolt95_token_probability(segment: number, token: number): number;
  _bolt95_language_id(): number;
  UTF8ToString(pointer: number): string;
  stringToNewUTF8(value: string): number;
}

type ModuleFactory = (options: {
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<WhisperModule>;

let module: WhisperModule | undefined;
let cancelled = false;

function send(response: WhisperWorkerResponse): void {
  self.postMessage(response);
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError("UNEXPECTED_FAILURE", "Local transcription failed.", {
    technicalDetail: error instanceof Error ? error.message : "unknown whisper failure",
    recoveryAction: "Dispose the worker and try again.",
  });
}

async function initialize(request: WhisperInitRequest): Promise<void> {
  cancelled = false;
  send({
    type: "whisper/progress",
    requestId: request.requestId,
    progress: { phase: "loading", message: "Loading Whisper WASM..." },
  });
  const imported = (await import(/* @vite-ignore */ request.wasmModuleUrl)) as {
    default: ModuleFactory;
  };
  const nextModule = await imported.default({
    locateFile: () => request.wasmUrl,
    print: () => undefined,
    printErr: () => undefined,
  });
  if (cancelled) throw new AppError("JOB_CANCELLED", "Transcription was cancelled.");

  const modelBytes = new Uint8Array(request.model);
  const modelPointer = nextModule._malloc(modelBytes.byteLength);
  try {
    nextModule.HEAPU8.set(modelBytes, modelPointer);
    if (nextModule._bolt95_init(modelPointer, modelBytes.byteLength) !== 0) {
      throw new AppError("INPUT_INVALID", "Whisper rejected the model file.", {
        technicalDetail: "bolt95_init returned a non-zero status",
        recoveryAction: "Choose a compatible GGML Whisper model.",
      });
    }
  } finally {
    nextModule._free(modelPointer);
  }

  module?._bolt95_dispose();
  module = nextModule;
  send({
    type: "whisper/ready",
    requestId: request.requestId,
    wasmHeapBytes: module.HEAPU8.byteLength,
  });
}

function nullableTimestamp(value: number): number | null {
  return value < 0 ? null : value * 10;
}

function run(request: WhisperRunRequest): void {
  if (!module) {
    throw new AppError("CAPABILITY_UNSUPPORTED", "Whisper is not initialized.", {
      recoveryAction: "Load a model before transcribing.",
    });
  }
  cancelled = false;
  send({
    type: "whisper/progress",
    requestId: request.requestId,
    progress: { phase: "processing", message: "Transcribing locally..." },
  });

  const pcm = new Float32Array(request.pcm);
  const pcmPointer = module._malloc(pcm.byteLength);
  const languagePointer = module.stringToNewUTF8(request.language);
  try {
    module.HEAPF32.set(pcm, pcmPointer / Float32Array.BYTES_PER_ELEMENT);
    const status = module._bolt95_run(pcmPointer, pcm.length, languagePointer);
    if (cancelled) throw new AppError("JOB_CANCELLED", "Transcription was cancelled.");
    if (status !== 0) {
      throw new AppError("UNEXPECTED_FAILURE", "Whisper inference failed.", {
        technicalDetail: `bolt95_run returned ${status}`,
        recoveryAction: "Try a smaller model or reload the app.",
      });
    }

    const segments = [];
    for (let segmentIndex = 0; segmentIndex < module._bolt95_segment_count(); segmentIndex += 1) {
      const tokens = [];
      for (
        let tokenIndex = 0;
        tokenIndex < module._bolt95_token_count(segmentIndex);
        tokenIndex += 1
      ) {
        tokens.push({
          text: module.UTF8ToString(module._bolt95_token_text(segmentIndex, tokenIndex)),
          startMs: nullableTimestamp(module._bolt95_token_t0(segmentIndex, tokenIndex)),
          endMs: nullableTimestamp(module._bolt95_token_t1(segmentIndex, tokenIndex)),
          probability: module._bolt95_token_probability(segmentIndex, tokenIndex),
        });
      }
      segments.push({
        text: module.UTF8ToString(module._bolt95_segment_text(segmentIndex)),
        startMs: module._bolt95_segment_t0(segmentIndex) * 10,
        endMs: module._bolt95_segment_t1(segmentIndex) * 10,
        tokens,
      });
    }

    send({
      type: "whisper/result",
      requestId: request.requestId,
      result: {
        languageId: module._bolt95_language_id(),
        segments,
        wasmHeapBytes: module.HEAPU8.byteLength,
        peakPcmBytes: pcm.byteLength,
      },
    });
  } finally {
    module._free(languagePointer);
    module._free(pcmPointer);
  }
}

self.addEventListener("message", (event: MessageEvent<WhisperWorkerRequest>) => {
  const request = event.data;
  Promise.resolve()
    .then(async () => {
      if (request.type === "whisper/cancel") {
        cancelled = true;
        send({ type: "whisper/cancelled", requestId: request.requestId });
        return;
      }
      if (request.type === "whisper/dispose") {
        module?._bolt95_dispose();
        module = undefined;
        send({ type: "whisper/disposed", requestId: request.requestId });
        return;
      }
      if (request.type === "whisper/init") await initialize(request);
      if (request.type === "whisper/run") run(request);
    })
    .catch((error: unknown) => {
      send({
        type: "whisper/failure",
        requestId: request.requestId,
        error: serializeAppError(toAppError(error)),
      });
    });
});

export {};
