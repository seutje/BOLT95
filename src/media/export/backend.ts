import { canEncodeAudio, canEncodeVideo } from "mediabunny";
import type { EditorProject } from "../../domain/project/schema";
import {
  getRenderPreset,
  renderPresets,
  type RenderPresetDefinition,
} from "../../domain/rendering/presets";
import type { RenderPreset } from "../../domain/rendering/schema";
import type { AudioImportResult } from "../audio/types";

export const DRAFT_EXPORT_FRAME_RATE = 30;
export const DRAFT_EXPORT_MAX_DURATION_MS = 5_000;
export const DRAFT_EXPORT_VIDEO_BITRATE = 2_000_000;
export const DRAFT_EXPORT_AUDIO_BITRATE = 128_000;
export const DRAFT_EXPORT_AUDIO_SAMPLE_RATE = 48_000;

export type DraftVideoCodec = "vp9" | "vp8";
export type DraftAudioCodec = "opus";

export interface DraftVideoBackend {
  readonly id: "webcodecs-webm";
  readonly label: string;
  readonly container: "webm";
  readonly videoCodec: DraftVideoCodec;
  readonly audioCodec: DraftAudioCodec;
  readonly mimeType: string;
  readonly supported: boolean;
  readonly detail: string;
}

export interface DraftExportPreset {
  readonly id: RenderPreset;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly frameRate: number;
  readonly frameCount: number;
}

export interface DraftExportRisk {
  readonly level: "low" | "moderate" | "high";
  readonly reasons: readonly string[];
  readonly estimatedFrames: number;
  readonly estimatedPixels: number;
}

export interface DraftExportProgress {
  readonly phase: "preparing" | "frames" | "audio" | "finalizing" | "verifying" | "completed";
  readonly progress: number;
  readonly message: string;
}

export interface DraftExportResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly mimeType: string;
  readonly preset: DraftExportPreset;
  readonly backend: DraftVideoBackend;
  readonly expectedDurationMs: number;
  readonly verifiedDurationMs: number;
  readonly durationDriftMs: number;
  readonly submittedFrames: number;
  readonly encodedPackets: number;
}

const draftDefinitions = renderPresets.filter((preset) => preset.draft);

export const draftExportPresets: readonly DraftExportPreset[] = Object.freeze(
  draftDefinitions.map((preset) => toDraftExportPreset(preset, DRAFT_EXPORT_MAX_DURATION_MS)),
);

function toDraftExportPreset(
  definition: RenderPresetDefinition,
  durationMs: number,
): DraftExportPreset {
  return {
    id: definition.id,
    label: definition.label,
    width: definition.width,
    height: definition.height,
    durationMs,
    frameRate: DRAFT_EXPORT_FRAME_RATE,
    frameCount: Math.ceil((durationMs / 1_000) * DRAFT_EXPORT_FRAME_RATE),
  };
}

export function draftPresetForProject(
  project: EditorProject,
  presetId?: RenderPreset,
): DraftExportPreset {
  const projectPreset = project.visual?.preset;
  const requested =
    presetId ?? (projectPreset && getRenderPreset(projectPreset).draft ? projectPreset : undefined);
  return draftExportPresets.find((preset) => preset.id === requested) ?? draftExportPresets[2]!;
}

export function draftDurationMs(project: EditorProject, audio: AudioImportResult): number {
  const lineEnd = project.lines.reduce((maximum, line) => Math.max(maximum, line.endMs), 0);
  return Math.max(
    1_000,
    Math.min(DRAFT_EXPORT_MAX_DURATION_MS, audio.durationMs, lineEnd || audio.durationMs),
  );
}

export function estimateDraftExportRisk(
  preset: DraftExportPreset,
  audio: AudioImportResult,
  backend: DraftVideoBackend | null,
  deviceMemoryGb = typeof navigator !== "undefined" && "deviceMemory" in navigator
    ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory)
    : undefined,
): DraftExportRisk {
  const reasons: string[] = [];
  const estimatedPixels = preset.width * preset.height * preset.frameCount;
  if (!backend?.supported) reasons.push("No verified WebCodecs WebM backend is available.");
  if (preset.durationMs >= DRAFT_EXPORT_MAX_DURATION_MS)
    reasons.push("Draft export is capped at 5 seconds.");
  if (estimatedPixels > 120_000_000) reasons.push("This draft has a high pixel workload.");
  if (audio.pcm.length > 16_000 * 60)
    reasons.push("The source audio is longer than the draft window.");
  if (deviceMemoryGb !== undefined && deviceMemoryGb > 0 && deviceMemoryGb < 4) {
    reasons.push("Device memory is below the preferred export threshold.");
  }
  const level =
    !backend?.supported || estimatedPixels > 160_000_000
      ? "high"
      : reasons.length
        ? "moderate"
        : "low";
  return { level, reasons, estimatedFrames: preset.frameCount, estimatedPixels };
}

export async function probeDraftVideoBackend(
  preset: DraftExportPreset = draftExportPresets[2]!,
): Promise<DraftVideoBackend> {
  if (
    typeof VideoEncoder === "undefined" ||
    typeof AudioEncoder === "undefined" ||
    typeof HTMLCanvasElement === "undefined"
  ) {
    return unavailable("WebCodecs video/audio encoders and canvas are required.");
  }

  const [vp9, vp8, opus] = await Promise.all([
    canEncodeVideo("vp9", {
      width: preset.width,
      height: preset.height,
      bitrate: DRAFT_EXPORT_VIDEO_BITRATE,
    }),
    canEncodeVideo("vp8", {
      width: preset.width,
      height: preset.height,
      bitrate: DRAFT_EXPORT_VIDEO_BITRATE,
    }),
    canEncodeAudio("opus", {
      numberOfChannels: 1,
      sampleRate: DRAFT_EXPORT_AUDIO_SAMPLE_RATE,
      bitrate: DRAFT_EXPORT_AUDIO_BITRATE,
    }),
  ]);

  const codec: DraftVideoCodec | undefined = vp9 ? "vp9" : vp8 ? "vp8" : undefined;
  if (!codec || !opus) {
    return unavailable(`Codec probe failed: vp9=${vp9}, vp8=${vp8}, opus=${opus}.`);
  }
  return {
    id: "webcodecs-webm",
    label: `WebM draft (${codec.toUpperCase()} + Opus)`,
    container: "webm",
    videoCodec: codec,
    audioCodec: "opus",
    mimeType: `video/webm;codecs=${codec},opus`,
    supported: true,
    detail: "WebCodecs encode probes passed for the selected draft preset.",
  };
}

function unavailable(detail: string): DraftVideoBackend {
  return {
    id: "webcodecs-webm",
    label: "WebM draft",
    container: "webm",
    videoCodec: "vp9",
    audioCodec: "opus",
    mimeType: "video/webm",
    supported: false,
    detail,
  };
}
