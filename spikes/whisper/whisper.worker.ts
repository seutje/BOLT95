/// <reference lib="webworker" />

import type {
  TranscriptProofResult,
  TranscriptSegment,
  TranscriptToken,
  WhisperRequest,
  WhisperResponse,
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

function send(response: WhisperResponse): void {
  self.postMessage(response);
}

async function download(
  requestId: string,
  url: string,
  expectedBytes: number,
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Model download failed with HTTP ${response.status}`);
  }

  const totalBytes = Number(response.headers.get("content-length")) || expectedBytes;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    send({ type: "PROGRESS", requestId, phase: "download", loadedBytes, totalBytes });
  }

  if (loadedBytes !== expectedBytes) {
    throw new Error(`Model size mismatch: received ${loadedBytes}, expected ${expectedBytes}`);
  }

  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function initialize(request: Extract<WhisperRequest, { type: "INIT" }>): Promise<void> {
  send({ type: "PROGRESS", requestId: request.requestId, phase: "loading" });
  const imported = (await import(/* @vite-ignore */ request.wasmModuleUrl)) as {
    default: ModuleFactory;
  };
  module = await imported.default({
    locateFile: () => new URL("whisper.wasm", request.wasmModuleUrl).href,
    print: () => undefined,
    printErr: () => undefined,
  });
  const model = await download(request.requestId, request.modelUrl, request.expectedModelBytes);
  const modelPointer = module._malloc(model.byteLength);

  try {
    module.HEAPU8.set(model, modelPointer);
    if (module._bolt95_init(modelPointer, model.byteLength) !== 0) {
      throw new Error("whisper.cpp rejected the model");
    }
  } finally {
    module._free(modelPointer);
  }

  send({
    type: "READY",
    requestId: request.requestId,
    wasmHeapBytes: module.HEAPU8.byteLength,
  });
}

function nullableTimestamp(value: number): number | null {
  return value < 0 ? null : value * 10;
}

function run(request: Extract<WhisperRequest, { type: "RUN" }>): void {
  if (!module) throw new Error("Whisper module is not initialized");
  send({ type: "PROGRESS", requestId: request.requestId, phase: "processing" });

  const pcm = new Float32Array(request.pcm);
  const pcmPointer = module._malloc(pcm.byteLength);
  const languagePointer = module.stringToNewUTF8(request.language);

  try {
    module.HEAPF32.set(pcm, pcmPointer / Float32Array.BYTES_PER_ELEMENT);
    const status = module._bolt95_run(pcmPointer, pcm.length, languagePointer);
    if (status !== 0) throw new Error(`whisper.cpp inference failed with code ${status}`);

    const segments: TranscriptSegment[] = [];
    for (let segmentIndex = 0; segmentIndex < module._bolt95_segment_count(); segmentIndex += 1) {
      const tokens: TranscriptToken[] = [];
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

    const result: TranscriptProofResult = {
      languageId: module._bolt95_language_id(),
      segments,
      wasmHeapBytes: module.HEAPU8.byteLength,
    };
    send({ type: "RESULT", requestId: request.requestId, result });
  } finally {
    module._free(languagePointer);
    module._free(pcmPointer);
  }
}

self.addEventListener("message", (event: MessageEvent<WhisperRequest>) => {
  const request = event.data;
  Promise.resolve()
    .then(async () => {
      if (request.type === "INIT") await initialize(request);
      if (request.type === "RUN") run(request);
      if (request.type === "DISPOSE") {
        module?._bolt95_dispose();
        module = undefined;
        send({ type: "DISPOSED", requestId: request.requestId });
      }
    })
    .catch((error: unknown) => {
      send({
        type: "ERROR",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : "Unknown worker failure",
      });
    });
});

export {};
