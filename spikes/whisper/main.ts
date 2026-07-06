import manifest from "../../config/models.json";
import type { TranscriptProofResult, WhisperRequest, WhisperResponse } from "./protocol";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Whisper proof is missing ${selector}`);
  return element;
}

const isolated = requiredElement<HTMLElement>("#isolated");
const sharedArrayBuffer = requiredElement<HTMLElement>("#shared-array-buffer");
const runButton = requiredElement<HTMLButtonElement>("#run");
const cancelButton = requiredElement<HTMLButtonElement>("#cancel");
const status = requiredElement<HTMLElement>("#status");
const resultElement = requiredElement<HTMLElement>("#result");

isolated.textContent = String(window.crossOriginIsolated);
sharedArrayBuffer.textContent = String(typeof globalThis.SharedArrayBuffer !== "undefined");

const tinyModel =
  manifest.models.find((model) => model.id === "tiny-multilingual-q5_1") ??
  (() => {
    throw new Error("Tiny model is missing from the manifest");
  })();

const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
let activeWorker: Worker | undefined;
let cancelled = false;
let rejectActiveRequest: ((reason: DOMException) => void) | undefined;

function setStatus(message: string): void {
  status.textContent = message;
}

function parseMonoPcm16Wave(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const decoder = new TextDecoder("ascii");
  if (decoder.decode(new Uint8Array(buffer, 0, 4)) !== "RIFF") {
    throw new Error("Fixture is not a RIFF wave file");
  }

  let offset = 12;
  let format: { channels: number; sampleRate: number; bits: number } | undefined;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= buffer.byteLength) {
    const id = decoder.decode(new Uint8Array(buffer, offset, 4));
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      if (view.getUint16(offset + 8, true) !== 1) throw new Error("Fixture must use PCM");
      format = {
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bits: view.getUint16(offset + 22, true),
      };
    }
    if (id === "data") {
      dataOffset = offset + 8;
      dataBytes = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (!format || format.channels !== 1 || format.sampleRate !== 16_000 || format.bits !== 16) {
    throw new Error("Fixture must be 16 kHz mono signed 16-bit PCM");
  }
  if (dataOffset < 0) throw new Error("Fixture has no audio data");

  const samples = new Float32Array(dataBytes / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true) / 32_768;
  }
  return samples;
}

async function loadFixture(): Promise<Float32Array> {
  const response = await fetch(new URL("fixtures/generated/jfk.wav", baseUrl));
  if (!response.ok) throw new Error("Fixture is missing; run npm run fetch:fixture");
  return parseMonoPcm16Wave(await response.arrayBuffer());
}

function validateTiming(transcript: TranscriptProofResult): void {
  if (transcript.segments.length === 0) throw new Error("Whisper returned no segments");
  let previous = -1;
  let timedTokens = 0;
  for (const segment of transcript.segments) {
    if (segment.startMs < previous || segment.endMs < segment.startMs) {
      throw new Error("Segment timestamps are not monotonic");
    }
    previous = segment.endMs;
    for (const token of segment.tokens) {
      if (token.startMs === null || token.endMs === null || token.startMs < 0) continue;
      if (token.endMs < token.startMs) throw new Error("Token duration is negative");
      timedTokens += 1;
    }
  }
  if (timedTokens === 0) throw new Error("Whisper returned no timed token evidence");
}

function runWorkerRequest<T extends WhisperResponse["type"]>(
  worker: Worker,
  request: WhisperRequest,
  expectedType: T,
): Promise<Extract<WhisperResponse, { type: T }>> {
  return new Promise((resolve, reject) => {
    rejectActiveRequest = reject;
    const listener = (event: MessageEvent<WhisperResponse>): void => {
      const message = event.data;
      if (message.requestId !== request.requestId) return;
      if (message.type === "PROGRESS") {
        if (message.phase === "download" && message.loadedBytes && message.totalBytes) {
          const percent = Math.round((message.loadedBytes / message.totalBytes) * 100);
          setStatus(`Downloading model locally: ${percent}%`);
        } else {
          setStatus(message.phase === "loading" ? "Loading WASM…" : "Transcribing locally…");
        }
        return;
      }
      if (message.type === "ERROR") {
        worker.removeEventListener("message", listener);
        rejectActiveRequest = undefined;
        reject(new Error(message.message));
        return;
      }
      if (message.type === expectedType) {
        worker.removeEventListener("message", listener);
        rejectActiveRequest = undefined;
        resolve(message as Extract<WhisperResponse, { type: T }>);
      }
    };
    worker.addEventListener("message", listener);
    worker.postMessage(request, request.type === "RUN" ? [request.pcm] : []);
  });
}

async function runCycle(pcm: Float32Array, cycle: number): Promise<TranscriptProofResult> {
  const worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  activeWorker = worker;
  const prefix = `cycle-${cycle}`;
  const moduleUrl = new URL("wasm/generated/whisper.js", baseUrl).href;
  const modelUrl = new URL(`models/${tinyModel.fileName}`, baseUrl).href;

  await runWorkerRequest(
    worker,
    {
      type: "INIT",
      requestId: `${prefix}-init`,
      wasmModuleUrl: moduleUrl,
      modelUrl,
      expectedModelBytes: tinyModel.sizeBytes,
    },
    "READY",
  );
  if (cancelled) throw new DOMException("Cancelled", "AbortError");

  const response = await runWorkerRequest(
    worker,
    {
      type: "RUN",
      requestId: `${prefix}-run`,
      pcm: pcm.slice().buffer,
      language: "en",
    },
    "RESULT",
  );
  validateTiming(response.result);

  await runWorkerRequest(worker, { type: "DISPOSE", requestId: `${prefix}-dispose` }, "DISPOSED");
  worker.terminate();
  activeWorker = undefined;
  return response.result;
}

runButton.addEventListener("click", () => {
  void (async () => {
    cancelled = false;
    runButton.disabled = true;
    cancelButton.disabled = false;
    resultElement.textContent = "Preparing fixture…";
    const started = performance.now();

    try {
      const pcm = await loadFixture();
      const runs: Array<{ durationMs: number; wasmHeapBytes: number }> = [];
      let finalResult: TranscriptProofResult | undefined;
      for (let cycle = 1; cycle <= 3; cycle += 1) {
        setStatus(`Starting cycle ${cycle} of 3…`);
        const cycleStarted = performance.now();
        finalResult = await runCycle(pcm, cycle);
        runs.push({
          durationMs: Math.round(performance.now() - cycleStarted),
          wasmHeapBytes: finalResult.wasmHeapBytes,
        });
      }
      setStatus("Proof passed: three contexts disposed cleanly.");
      resultElement.textContent = JSON.stringify(
        {
          elapsedMs: Math.round(performance.now() - started),
          pcmBytes: pcm.byteLength,
          modelBytes: tinyModel.sizeBytes,
          runs,
          transcript: finalResult,
        },
        null,
        2,
      );
      document.body.dataset.proof = "passed";
    } catch (error) {
      const wasCancelled = error instanceof DOMException && error.name === "AbortError";
      setStatus(wasCancelled ? "Cancelled. The proof can be restarted." : "Proof failed.");
      resultElement.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.proof = wasCancelled ? "cancelled" : "failed";
    } finally {
      activeWorker?.terminate();
      activeWorker = undefined;
      runButton.disabled = false;
      cancelButton.disabled = true;
    }
  })();
});

cancelButton.addEventListener("click", () => {
  cancelled = true;
  activeWorker?.terminate();
  activeWorker = undefined;
  rejectActiveRequest?.(new DOMException("Cancelled", "AbortError"));
  rejectActiveRequest = undefined;
  setStatus("Cancelling and terminating the worker…");
});
