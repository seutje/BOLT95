import {
  AudioBufferSource,
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import type { EditorProject } from "../../../domain/project/schema";
import { renderFrame } from "../../../domain/rendering/renderer";
import type { RenderPreset } from "../../../domain/rendering/schema";
import { withDefaultVisualTheme } from "../../../domain/rendering/schema";
import { lyricsForFrame } from "../../../domain/rendering/timing";
import type { AudioImportResult } from "../../audio/types";
import {
  DRAFT_EXPORT_AUDIO_SAMPLE_RATE,
  FULL_EXPORT_AUDIO_BITRATE,
  FULL_EXPORT_VIDEO_BITRATE,
  LONG_EXPORT_SYNC_TOLERANCE_MS,
  exportDurationMs,
  videoPresetForProject,
  type DraftExportProgress,
  type DraftExportResult,
  type DraftVideoBackend,
} from "../backend";
import { verifyVideoBlob } from "./draftWebm";

export interface ExportWebCodecsMp4Options {
  readonly project: EditorProject;
  readonly audio: AudioImportResult;
  readonly backend: DraftVideoBackend;
  readonly presetId?: RenderPreset;
  readonly backgroundImage?: CanvasImageSource;
  readonly signal: AbortSignal;
  readonly onProgress?: (progress: DraftExportProgress) => void;
}

const ENCODE_QUEUE_LIMIT = 3;
const KEYFRAME_INTERVAL_SECONDS = 2;

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
  return project.audio.fileName.replace(/\.[^.]+$/u, "") || "bolt95";
}

function makeFileName(project: EditorProject, presetId: RenderPreset, draft: boolean): string {
  return `${titleBase(project)}.${presetId}${draft ? ".draft" : ""}.mp4`;
}

function createMp4AudioBuffer(audio: AudioImportResult, durationMs: number): AudioBuffer {
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

function copyChunkData(chunk: EncodedVideoChunk): Uint8Array {
  const data = new Uint8Array(chunk.byteLength);
  chunk.copyTo(data);
  return data;
}

function packetFromChunk(chunk: EncodedVideoChunk, sequenceNumber: number): EncodedPacket {
  return new EncodedPacket(
    copyChunkData(chunk),
    chunk.type,
    chunk.timestamp / 1_000_000,
    (chunk.duration ?? 0) / 1_000_000,
    sequenceNumber,
  );
}

async function waitForBackpressure(encoder: VideoEncoder, signal: AbortSignal): Promise<void> {
  while (encoder.encodeQueueSize > ENCODE_QUEUE_LIMIT) {
    throwIfAborted(signal);
    await nextFrame();
  }
}

export async function exportWebCodecsMp4({
  project,
  audio,
  backend,
  presetId,
  backgroundImage,
  signal,
  onProgress = () => undefined,
}: ExportWebCodecsMp4Options): Promise<DraftExportResult> {
  if (!backend.supported) throw new Error(backend.detail);
  if (backend.id !== "webcodecs-mp4") throw new Error("WebCodecs MP4 backend is required.");
  if (!backend.fullCodecString) throw new Error("MP4 H.264 codec probe is missing.");
  if (backend.audioCodec !== "aac") throw new Error("MP4 AAC audio codec probe is missing.");
  if (typeof VideoEncoder === "undefined") throw new Error("VideoEncoder is unavailable.");

  const basePreset = videoPresetForProject(project, presetId);
  const preset = {
    ...basePreset,
    durationMs: exportDurationMs(project, audio, basePreset),
    frameCount: 0,
  };
  const durationMs = preset.durationMs;
  preset.frameCount = Math.ceil((durationMs / 1_000) * preset.frameRate);
  const keyFrameInterval = Math.max(1, Math.round(KEYFRAME_INTERVAL_SECONDS * preset.frameRate));
  const theme = {
    ...withDefaultVisualTheme(project.visual),
    preset: preset.id,
    transition: "none" as const,
  };
  const canvas = createCanvas(preset.width, preset.height);
  const context = required2dContext(canvas);
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const videoSource = new EncodedVideoPacketSource("avc");
  const audioSource = new AudioBufferSource({
    codec: backend.audioCodec,
    bitrate: FULL_EXPORT_AUDIO_BITRATE,
  });
  output.addVideoTrack(videoSource, {
    frameRate: preset.frameRate,
    maximumPacketCount: preset.frameCount,
  });
  output.addAudioTrack(audioSource);

  let encodedPackets = 0;
  let sequenceNumber = 0;
  let muxQueue: Promise<void> = Promise.resolve();
  let encoderError: unknown = null;
  let started = false;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const packet = packetFromChunk(chunk, sequenceNumber);
      sequenceNumber += 1;
      encodedPackets += 1;
      muxQueue = muxQueue
        .then(() => videoSource.add(packet, meta))
        .catch((error: unknown) => {
          encoderError = error;
          throw error;
        });
    },
    error: (error) => {
      encoderError = error;
    },
  });

  const cancelOutput = async () => {
    if (started && output.state !== "canceled" && output.state !== "finalized") {
      await output.cancel().catch(() => undefined);
    }
  };

  try {
    throwIfAborted(signal);
    onProgress({ phase: "preparing", progress: 0, message: "Preparing MP4 H.264 encoder." });
    await output.start();
    started = true;
    const config: VideoEncoderConfig = {
      codec: backend.fullCodecString,
      width: preset.width,
      height: preset.height,
      bitrate: FULL_EXPORT_VIDEO_BITRATE,
      framerate: preset.frameRate,
      latencyMode: "quality",
      hardwareAcceleration: "no-preference",
      alpha: "discard",
    };
    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) throw new Error(`H.264 encoder rejected ${config.codec}.`);
    encoder.configure(support.config ?? config);
    throwIfAborted(signal);
    onProgress({ phase: "audio", progress: 0.06, message: "Encoding MP4 AAC audio." });
    const audioPromise = audioSource.add(createMp4AudioBuffer(audio, durationMs));

    for (let frame = 0; frame < preset.frameCount; frame += 1) {
      throwIfAborted(signal);
      if (encoderError) throw encoderError;
      await waitForBackpressure(encoder, signal);
      const timestamp = Math.round((frame * 1_000_000) / preset.frameRate);
      const nextTimestamp = Math.round(((frame + 1) * 1_000_000) / preset.frameRate);
      const duration = nextTimestamp - timestamp;
      const timeMs = Math.min(durationMs - 1, Math.round(timestamp / 1_000));
      renderFrame(context, {
        theme,
        lyrics: lyricsForFrame(project, timeMs),
        reducedMotion: true,
        ...(backgroundImage ? { backgroundImage } : {}),
      });
      const videoFrame = new VideoFrame(canvas, { timestamp, duration });
      try {
        encoder.encode(videoFrame, { keyFrame: frame % keyFrameInterval === 0 });
      } finally {
        videoFrame.close();
      }
      if (frame % 5 === 0) await nextFrame();
      onProgress({
        phase: "frames",
        progress: 0.1 + ((frame + 1) / preset.frameCount) * 0.77,
        message: `Encoded MP4 frame ${frame + 1} of ${preset.frameCount}.`,
      });
    }

    await audioPromise;
    throwIfAborted(signal);
    onProgress({ phase: "finalizing", progress: 0.9, message: "Finalizing MP4 file." });
    await encoder.flush();
    await muxQueue;
    if (encoderError) throw encoderError;
    await output.finalize();
    if (!target.buffer) throw new Error("MP4 muxer produced no output.");
    const mimeType = await output.getMimeType();
    const blob = new Blob([target.buffer], { type: "video/mp4" });

    throwIfAborted(signal);
    onProgress({ phase: "verifying", progress: 0.96, message: "Verifying MP4 playback." });
    const verifiedDurationMs = await verifyVideoBlob(
      blob,
      durationMs,
      preset.mode === "full" ? LONG_EXPORT_SYNC_TOLERANCE_MS : 100,
      "MP4",
    );
    onProgress({ phase: "completed", progress: 1, message: "MP4 ready." });
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
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}
