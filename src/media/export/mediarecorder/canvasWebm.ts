import type { EditorProject } from "../../../domain/project/schema";
import { renderFrame } from "../../../domain/rendering/renderer";
import type { RenderPreset } from "../../../domain/rendering/schema";
import { withDefaultVisualTheme } from "../../../domain/rendering/schema";
import { lyricsForFrame } from "../../../domain/rendering/timing";
import type { AudioImportResult } from "../../audio/types";
import {
  LONG_EXPORT_SYNC_TOLERANCE_MS,
  exportDurationMs,
  videoPresetForProject,
  type DraftExportProgress,
  type DraftExportResult,
  type DraftVideoBackend,
} from "../backend";
import { verifyDraftVideoBlob } from "../webcodecs/draftWebm";

export interface ExportMediaRecorderWebmOptions {
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
  return project.audio.fileName.replace(/\.[^.]+$/u, "") || "bolt95";
}

function makeFileName(project: EditorProject, presetId: RenderPreset, draft: boolean): string {
  return `${titleBase(project)}.${presetId}${draft ? ".draft" : ""}.fallback.webm`;
}

function recorderStop(recorder: MediaRecorder): Promise<void> {
  if (recorder.state === "inactive") return Promise.resolve();
  return new Promise((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.stop();
  });
}

export async function exportMediaRecorderWebm({
  project,
  audio,
  backend,
  presetId,
  signal,
  onProgress = () => undefined,
}: ExportMediaRecorderWebmOptions): Promise<DraftExportResult> {
  if (!backend.supported) throw new Error(backend.detail);
  if (backend.id !== "mediarecorder-webm") throw new Error("MediaRecorder backend is required.");

  const basePreset = videoPresetForProject(project, presetId);
  const preset = {
    ...basePreset,
    durationMs: exportDurationMs(project, audio, basePreset),
    frameCount: 0,
  };
  const durationMs = preset.durationMs;
  preset.frameCount = Math.ceil((durationMs / 1_000) * preset.frameRate);
  const frameDurationMs = 1_000 / preset.frameRate;
  const canvas = createCanvas(preset.width, preset.height);
  const context = required2dContext(canvas);
  const stream = canvas.captureStream(0);
  const recorder = new MediaRecorder(stream, { mimeType: backend.mimeType });
  const chunks: Blob[] = [];
  let encodedPackets = 0;
  let stopped = false;

  const theme = {
    ...withDefaultVisualTheme(project.visual),
    preset: preset.id,
    transition: "none" as const,
  };

  const stopTracks = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  const abort = () => {
    if (recorder.state !== "inactive") recorder.stop();
    stopTracks();
  };
  signal.addEventListener("abort", abort, { once: true });

  try {
    throwIfAborted(signal);
    onProgress({ phase: "preparing", progress: 0, message: "Preparing MediaRecorder fallback." });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        encodedPackets += 1;
      }
    });
    recorder.start();

    for (let frame = 0; frame < preset.frameCount; frame += 1) {
      throwIfAborted(signal);
      const timeMs = Math.min(durationMs - 1, Math.round(frame * frameDurationMs));
      renderFrame(context, { theme, lyrics: lyricsForFrame(project, timeMs), reducedMotion: true });
      (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined)?.requestFrame();
      await nextFrame();
      onProgress({
        phase: "frames",
        progress: 0.08 + ((frame + 1) / preset.frameCount) * 0.78,
        message: `Recorded fallback frame ${frame + 1} of ${preset.frameCount}.`,
      });
    }

    throwIfAborted(signal);
    onProgress({ phase: "finalizing", progress: 0.9, message: "Finalizing fallback WebM." });
    await recorderStop(recorder);
    stopped = true;
    const blob = new Blob(chunks, { type: backend.mimeType });
    if (blob.size === 0) throw new Error("MediaRecorder produced no output.");

    throwIfAborted(signal);
    onProgress({ phase: "verifying", progress: 0.96, message: "Verifying fallback playback." });
    const verifiedDurationMs = await verifyDraftVideoBlob(
      blob,
      durationMs,
      preset.mode === "full" ? LONG_EXPORT_SYNC_TOLERANCE_MS : 1_000,
    );
    onProgress({ phase: "completed", progress: 1, message: "Fallback WebM ready." });
    return {
      blob,
      fileName: makeFileName(project, preset.id, preset.mode === "draft"),
      mimeType: blob.type || backend.mimeType,
      preset,
      backend,
      expectedDurationMs: durationMs,
      verifiedDurationMs,
      durationDriftMs: Math.round(Math.abs(verifiedDurationMs - durationMs)),
      submittedFrames: preset.frameCount,
      encodedPackets,
    };
  } finally {
    signal.removeEventListener("abort", abort);
    if (!stopped && recorder.state !== "inactive") {
      await recorderStop(recorder).catch(() => undefined);
    }
    stopTracks();
  }
}
