import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Output,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import {
  normalizeCapabilityMode,
  type CodecProbe,
  type ProofCapabilities,
} from "../../src/infrastructure/capabilities/normalize";

const WIDTH = 960;
const HEIGHT = 540;
const DURATION_SECONDS = 5;
const FRAME_RATE = 30;
const FRAME_DURATION = 1 / FRAME_RATE;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Video proof is missing ${selector}`);
  return element;
}

function requiredContext(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = element.getContext("2d");
  if (!value) throw new Error("Canvas 2D is unavailable");
  return value;
}

const canvas = requiredElement<HTMLCanvasElement>("#canvas");
const video = requiredElement<HTMLVideoElement>("#video");
const exportButton = requiredElement<HTMLButtonElement>("#export");
const cancelButton = requiredElement<HTMLButtonElement>("#cancel");
const status = requiredElement<HTMLElement>("#status");
const result = requiredElement<HTMLElement>("#result");
const capabilityList = requiredElement<HTMLElement>("#capabilities");
const context = requiredContext(canvas);

let selectedVideoCodec: "vp9" | "vp8" | undefined;
let activeOutput: Output<WebMOutputFormat, BufferTarget> | undefined;
let controller: AbortController | undefined;
let resultUrl: string | undefined;

function drawFrame(time: number): void {
  const progress = time / DURATION_SECONDS;
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, `hsl(${220 + progress * 40} 65% 18%)`);
  gradient.addColorStop(1, `hsl(${280 + progress * 30} 70% 30%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const barWidth = Math.round((WIDTH - 160) * progress);
  context.fillStyle = "rgba(255, 255, 255, 0.2)";
  context.fillRect(80, HEIGHT - 80, WIDTH - 160, 12);
  context.fillStyle = "#00ffff";
  context.fillRect(80, HEIGHT - 80, barWidth, 12);

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 58px sans-serif";
  context.lineWidth = 8;
  context.strokeStyle = "#000";
  context.fillStyle = "#fff";
  const lyric = progress < 0.5 ? "Timing every word" : "Entirely in your browser";
  context.strokeText(lyric, WIDTH / 2, HEIGHT / 2);
  context.fillText(lyric, WIDTH / 2, HEIGHT / 2);

  context.font = "24px monospace";
  const timeLabel = `${time.toFixed(2)} s`;
  context.fillText(timeLabel, WIDTH / 2, HEIGHT / 2 + 80);
}

function createAudio(): AudioBuffer {
  const sampleRate = 48_000;
  const buffer = new AudioBuffer({
    length: sampleRate * DURATION_SECONDS,
    numberOfChannels: 1,
    sampleRate,
  });
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time * 8, (DURATION_SECONDS - time) * 8);
    channel[index] = Math.sin(2 * Math.PI * 220 * time) * 0.12 * Math.max(0, envelope);
  }
  return buffer;
}

async function probe(): Promise<void> {
  const probes: CodecProbe[] = await Promise.all([
    Promise.all([
      canEncodeVideo("vp9", { width: WIDTH, height: HEIGHT, bitrate: 2_000_000 }),
      canEncodeAudio("opus", { numberOfChannels: 1, sampleRate: 48_000, bitrate: 128_000 }),
    ]).then(([videoSupported, audioSupported]) => ({
      id: "VP9 + Opus / WebM",
      supported: videoSupported && audioSupported,
      detail: `video=${videoSupported}, audio=${audioSupported}`,
    })),
    Promise.all([
      canEncodeVideo("vp8", { width: WIDTH, height: HEIGHT, bitrate: 2_000_000 }),
      canEncodeAudio("opus", { numberOfChannels: 1, sampleRate: 48_000, bitrate: 128_000 }),
    ]).then(([videoSupported, audioSupported]) => ({
      id: "VP8 + Opus / WebM",
      supported: videoSupported && audioSupported,
      detail: `video=${videoSupported}, audio=${audioSupported}`,
    })),
    Promise.all([
      canEncodeVideo("avc", { width: WIDTH, height: HEIGHT, bitrate: 2_000_000 }),
      canEncodeAudio("aac", { numberOfChannels: 1, sampleRate: 48_000, bitrate: 128_000 }),
    ]).then(([videoSupported, audioSupported]) => ({
      id: "AVC + AAC / MP4 candidate",
      supported: videoSupported && audioSupported,
      detail: `video=${videoSupported}, audio=${audioSupported}; mux/playback not proven here`,
    })),
    Promise.resolve({
      id: "MediaRecorder WebM",
      supported:
        typeof MediaRecorder !== "undefined" &&
        ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].some((type) =>
          MediaRecorder.isTypeSupported(type),
        ),
    }),
  ]);

  const capabilities: ProofCapabilities = {
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof globalThis.SharedArrayBuffer !== "undefined",
    webCodecs: typeof globalThis.VideoEncoder !== "undefined",
    videoEncoder: typeof globalThis.VideoEncoder !== "undefined",
    audioEncoder: typeof globalThis.AudioEncoder !== "undefined",
    mediaRecorder: typeof globalThis.MediaRecorder !== "undefined",
    codecs: probes,
  };

  selectedVideoCodec = probes[0]?.supported ? "vp9" : probes[1]?.supported ? "vp8" : undefined;
  capabilityList.replaceChildren();
  const facts: Array<[string, string]> = [
    ["Mode", normalizeCapabilityMode(capabilities)],
    ["Cross-origin isolated", String(capabilities.crossOriginIsolated)],
    ["SharedArrayBuffer", String(capabilities.sharedArrayBuffer)],
    ...probes.map((item): [string, string] => [
      item.id,
      `${item.supported ? "supported" : "unavailable"}${item.detail ? ` (${item.detail})` : ""}`,
    ]),
  ];
  for (const [name, value] of facts) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = name;
    description.textContent = value;
    capabilityList.append(term, description);
  }

  exportButton.disabled = !selectedVideoCodec;
  status.textContent = selectedVideoCodec
    ? `Ready. The proof will use ${selectedVideoCodec.toUpperCase()} + Opus.`
    : "WebCodecs WebM export is unavailable; MediaRecorder remains a later fallback.";
  document.body.dataset.probes = "complete";
}

async function waitForMetadata(element: HTMLVideoElement): Promise<number> {
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return element.duration;
  await new Promise<void>((resolve, reject) => {
    element.addEventListener("loadedmetadata", () => resolve(), { once: true });
    element.addEventListener(
      "error",
      () => reject(new Error("Browser could not decode the result")),
      {
        once: true,
      },
    );
  });
  return element.duration;
}

exportButton.addEventListener("click", () => {
  void (async () => {
    if (!selectedVideoCodec) return;
    exportButton.disabled = true;
    cancelButton.disabled = false;
    controller = new AbortController();
    const started = performance.now();
    let encodedPackets = 0;
    let submittedFrames = 0;

    try {
      const target = new BufferTarget();
      const output = new Output({ format: new WebMOutputFormat(), target });
      activeOutput = output;
      const videoSource = new CanvasSource(canvas, {
        codec: selectedVideoCodec,
        bitrate: 2_000_000,
        keyFrameInterval: 1,
        onEncodedPacket: () => {
          encodedPackets += 1;
        },
      });
      const audioSource = new AudioBufferSource({ codec: "opus", bitrate: 128_000 });
      output.addVideoTrack(videoSource);
      output.addAudioTrack(audioSource);
      await output.start();

      const audioPromise = audioSource.add(createAudio());
      const frameCount = DURATION_SECONDS * FRAME_RATE;
      for (let frame = 0; frame < frameCount; frame += 1) {
        if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const timestamp = frame * FRAME_DURATION;
        drawFrame(timestamp);
        await videoSource.add(timestamp, FRAME_DURATION, { keyFrame: frame % FRAME_RATE === 0 });
        submittedFrames += 1;
        status.textContent = `Encoding frame ${submittedFrames} of ${frameCount}…`;
        if (frame % 5 === 0) await new Promise(requestAnimationFrame);
      }
      await audioPromise;
      status.textContent = "Finalizing WebM…";
      await output.finalize();
      activeOutput = undefined;

      if (!target.buffer) throw new Error("Muxer produced no output");
      const blob = new Blob([target.buffer], { type: await output.getMimeType() });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(blob);
      video.src = resultUrl;
      const actualDuration = await waitForMetadata(video);
      const driftMs = Math.round(Math.abs(actualDuration - DURATION_SECONDS) * 1000);
      if (driftMs > 100) throw new Error(`Output duration drift is ${driftMs} ms`);

      result.textContent = JSON.stringify(
        {
          codec: selectedVideoCodec,
          mimeType: blob.type,
          bytes: blob.size,
          submittedFrames,
          encodedPackets,
          expectedDurationSeconds: DURATION_SECONDS,
          actualDurationSeconds: actualDuration,
          driftMs,
          elapsedMs: Math.round(performance.now() - started),
        },
        null,
        2,
      );
      status.textContent =
        "Proof passed. The generated WebM is playable and within sync tolerance.";
      document.body.dataset.proof = "passed";
    } catch (error) {
      const wasCancelled = error instanceof DOMException && error.name === "AbortError";
      if (activeOutput && activeOutput.state !== "canceled" && activeOutput.state !== "finalized") {
        await activeOutput.cancel().catch(() => undefined);
      }
      activeOutput = undefined;
      status.textContent = wasCancelled ? "Cancelled. Export can be restarted." : "Export failed.";
      result.textContent = error instanceof Error ? error.message : String(error);
      document.body.dataset.proof = wasCancelled ? "cancelled" : "failed";
    } finally {
      controller = undefined;
      exportButton.disabled = !selectedVideoCodec;
      cancelButton.disabled = true;
    }
  })();
});

cancelButton.addEventListener("click", () => {
  controller?.abort();
  status.textContent = "Cancelling encoders and discarding partial output…";
});

drawFrame(0);
void probe().catch((error: unknown) => {
  status.textContent = "Capability probe failed.";
  result.textContent = error instanceof Error ? error.message : String(error);
  document.body.dataset.probes = "failed";
});

window.addEventListener("beforeunload", () => {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  controller?.abort();
});
