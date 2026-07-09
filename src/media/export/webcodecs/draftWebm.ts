import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Output,
  WebMOutputFormat,
} from "mediabunny";
import type { EditorProject } from "../../../domain/project/schema";
import { renderFrame } from "../../../domain/rendering/renderer";
import type { RenderPreset } from "../../../domain/rendering/schema";
import { withDefaultVisualTheme } from "../../../domain/rendering/schema";
import { lyricsForFrame } from "../../../domain/rendering/timing";
import type { AudioImportResult } from "../../audio/types";
import {
  DRAFT_EXPORT_AUDIO_BITRATE,
  DRAFT_EXPORT_AUDIO_SAMPLE_RATE,
  DRAFT_EXPORT_VIDEO_BITRATE,
  FULL_EXPORT_AUDIO_BITRATE,
  FULL_EXPORT_VIDEO_BITRATE,
  LONG_EXPORT_SYNC_TOLERANCE_MS,
  exportDurationMs,
  videoPresetForProject,
  type DraftExportProgress,
  type DraftExportResult,
  type DraftVideoBackend,
} from "../backend";

export interface ExportDraftWebmOptions {
  readonly project: EditorProject;
  readonly audio: AudioImportResult;
  readonly backend: DraftVideoBackend;
  readonly presetId?: RenderPreset;
  readonly signal: AbortSignal;
  readonly onProgress?: (progress: DraftExportProgress) => void;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Video export was cancelled.", "AbortError");
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function required2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D rendering is unavailable.");
  return context;
}

function titleBase(project: EditorProject): string {
  return project.audio.fileName.replace(/\.[^.]+$/u, "") || "bolt95-draft";
}

function makeFileName(project: EditorProject, presetId: RenderPreset, draft: boolean): string {
  return `${titleBase(project)}.${presetId}${draft ? ".draft" : ""}.webm`;
}

function createDraftAudioBuffer(audio: AudioImportResult, durationMs: number): AudioBuffer {
  const outputLength = Math.max(
    1,
    Math.round((durationMs / 1_000) * DRAFT_EXPORT_AUDIO_SAMPLE_RATE),
  );
  const buffer = new AudioBuffer({
    length: outputLength,
    numberOfChannels: 1,
    sampleRate: DRAFT_EXPORT_AUDIO_SAMPLE_RATE,
  });
  const channel = buffer.getChannelData(0);
  const source = audio.pcm;
  const ratio = audio.sampleRate / DRAFT_EXPORT_AUDIO_SAMPLE_RATE;
  for (let index = 0; index < channel.length; index += 1) {
    const sourcePosition = index * ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(source.length - 1, left + 1);
    const fraction = sourcePosition - left;
    channel[index] = (source[left] ?? 0) * (1 - fraction) + (source[right] ?? 0) * fraction;
  }
  return buffer;
}

async function waitForVideoMetadata(url: string): Promise<number> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.src = url;
  try {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video.addEventListener(
          "error",
          () => reject(new Error("Browser could not decode the draft WebM.")),
          {
            once: true,
          },
        );
      });
    }
    return video.duration * 1_000;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export async function verifyVideoBlob(
  blob: Blob,
  expectedDurationMs: number,
  toleranceMs = 100,
  containerLabel = "Video",
): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const durationMs = await waitForVideoMetadata(url);
    const driftMs = Math.abs(durationMs - expectedDurationMs);
    if (!Number.isFinite(durationMs) || driftMs > toleranceMs) {
      throw new Error(`${containerLabel} duration drift is ${Math.round(driftMs)} ms.`);
    }
    return durationMs;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function verifyDraftVideoBlob(
  blob: Blob,
  expectedDurationMs: number,
  toleranceMs = 100,
): Promise<number> {
  return verifyVideoBlob(blob, expectedDurationMs, toleranceMs, "WebM");
}

export async function exportDraftWebm({
  project,
  audio,
  backend,
  presetId,
  signal,
  onProgress = () => undefined,
}: ExportDraftWebmOptions): Promise<DraftExportResult> {
  if (!backend.supported) throw new Error(backend.detail);
  if (backend.id !== "webcodecs-webm") throw new Error("WebCodecs WebM backend is required.");
  if (!backend.audioCodec) throw new Error("WebM audio codec probe is missing.");
  const basePreset = videoPresetForProject(project, presetId);
  const preset = {
    ...basePreset,
    durationMs: exportDurationMs(project, audio, basePreset),
    frameCount: 0,
  };
  const durationMs = preset.durationMs;
  const frameDurationSeconds = 1 / preset.frameRate;
  preset.frameCount = Math.ceil((durationMs / 1_000) * preset.frameRate);
  const theme = {
    ...withDefaultVisualTheme(project.visual),
    preset: preset.id,
    transition: "none" as const,
  };
  const canvas = createCanvas(preset.width, preset.height);
  const context = required2dContext(canvas);
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  let encodedPackets = 0;
  let started = false;

  const cancelOutput = async () => {
    if (started && output.state !== "canceled" && output.state !== "finalized") {
      await output.cancel().catch(() => undefined);
    }
  };

  try {
    throwIfAborted(signal);
    onProgress({ phase: "preparing", progress: 0, message: "Preparing WebM encoders." });
    const videoSource = new CanvasSource(canvas, {
      codec: backend.videoCodec,
      bitrate: preset.mode === "full" ? FULL_EXPORT_VIDEO_BITRATE : DRAFT_EXPORT_VIDEO_BITRATE,
      keyFrameInterval: 1,
      onEncodedPacket: () => {
        encodedPackets += 1;
      },
    });
    const audioSource = new AudioBufferSource({
      codec: backend.audioCodec,
      bitrate: preset.mode === "full" ? FULL_EXPORT_AUDIO_BITRATE : DRAFT_EXPORT_AUDIO_BITRATE,
    });
    output.addVideoTrack(videoSource);
    output.addAudioTrack(audioSource);
    await output.start();
    started = true;

    throwIfAborted(signal);
    onProgress({ phase: "audio", progress: 0.08, message: "Encoding draft audio." });
    const audioPromise = audioSource.add(createDraftAudioBuffer(audio, durationMs));

    for (let frame = 0; frame < preset.frameCount; frame += 1) {
      throwIfAborted(signal);
      const timeMs = Math.min(durationMs - 1, Math.round(frame * frameDurationSeconds * 1_000));
      renderFrame(context, { theme, lyrics: lyricsForFrame(project, timeMs), reducedMotion: true });
      await videoSource.add(frame * frameDurationSeconds, frameDurationSeconds, {
        keyFrame: frame % preset.frameRate === 0,
      });
      if (frame % 5 === 0) await nextFrame();
      onProgress({
        phase: "frames",
        progress: 0.1 + ((frame + 1) / preset.frameCount) * 0.72,
        message: `Encoded frame ${frame + 1} of ${preset.frameCount}.`,
      });
    }

    await audioPromise;
    throwIfAborted(signal);
    onProgress({ phase: "finalizing", progress: 0.86, message: "Finalizing WebM file." });
    await output.finalize();
    if (!target.buffer) throw new Error("WebM muxer produced no output.");
    const mimeType = await output.getMimeType();
    const blob = new Blob([target.buffer], { type: mimeType });

    throwIfAborted(signal);
    onProgress({ phase: "verifying", progress: 0.95, message: "Verifying browser playback." });
    const verifiedDurationMs = await verifyDraftVideoBlob(
      blob,
      durationMs,
      preset.mode === "full" ? LONG_EXPORT_SYNC_TOLERANCE_MS : 100,
    );
    onProgress({ phase: "completed", progress: 1, message: "WebM ready." });
    return {
      blob,
      fileName: makeFileName(project, preset.id, preset.mode === "draft"),
      mimeType,
      preset,
      backend,
      expectedDurationMs: durationMs,
      verifiedDurationMs,
      durationDriftMs: Math.round(Math.abs(verifiedDurationMs - durationMs)),
      submittedFrames: preset.frameCount,
      encodedPackets,
    };
  } catch (error) {
    await cancelOutput();
    throw error;
  }
}
