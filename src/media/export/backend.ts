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
export const FULL_EXPORT_FRAME_RATE = 30;
export const FULL_EXPORT_VIDEO_BITRATE = 8_000_000;
export const FULL_EXPORT_AUDIO_BITRATE = 160_000;
export const LONG_EXPORT_SYNC_TOLERANCE_MS = 500;

export type DraftVideoCodec = "vp9" | "vp8";
export type DraftAudioCodec = "opus";
export type ExportMode = "draft" | "full";
export type ExportBackendKind = "webcodecs-webm" | "mediarecorder-webm";

export interface DraftVideoBackend {
  readonly id: ExportBackendKind;
  readonly label: string;
  readonly container: "webm";
  readonly videoCodec: DraftVideoCodec;
  readonly audioCodec: DraftAudioCodec;
  readonly mimeType: string;
  readonly supported: boolean;
  readonly detail: string;
  readonly deterministic: boolean;
}

export interface DraftExportPreset {
  readonly id: RenderPreset;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly frameRate: number;
  readonly frameCount: number;
  readonly mode: ExportMode;
  readonly maximumDurationMs?: number;
  readonly recommendedDeviceMemoryGb: number;
  readonly benchmarkNote: string;
}

export interface DraftExportRisk {
  readonly level: "low" | "moderate" | "high";
  readonly reasons: readonly string[];
  readonly blockers: readonly string[];
  readonly estimatedFrames: number;
  readonly estimatedPixels: number;
  readonly qualified: boolean;
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
const fullDefinitions = renderPresets.filter((preset) => !preset.draft);

const fullPolicies: Record<
  Extract<RenderPreset, "square-full" | "portrait-full" | "landscape-full">,
  {
    readonly recommendedDeviceMemoryGb: number;
    readonly benchmarkNote: string;
  }
> = {
  "square-full": {
    recommendedDeviceMemoryGb: 4,
    benchmarkNote: "1080 square full export uses the complete project duration.",
  },
  "portrait-full": {
    recommendedDeviceMemoryGb: 8,
    benchmarkNote: "1080x1920 portrait full export uses the complete project duration.",
  },
  "landscape-full": {
    recommendedDeviceMemoryGb: 8,
    benchmarkNote: "1920x1080 landscape full export uses the complete project duration.",
  },
};

export const draftExportPresets: readonly DraftExportPreset[] = Object.freeze(
  draftDefinitions.map((preset) =>
    toVideoExportPreset(preset, DRAFT_EXPORT_MAX_DURATION_MS, "draft"),
  ),
);

export const fullExportPresets: readonly DraftExportPreset[] = Object.freeze(
  fullDefinitions.map((preset) => toVideoExportPreset(preset, 0, "full")),
);

export const videoExportPresets: readonly DraftExportPreset[] = Object.freeze([
  ...draftExportPresets,
  ...fullExportPresets,
]);

function fullPolicy(id: RenderPreset) {
  if (id === "square-full" || id === "portrait-full" || id === "landscape-full") {
    return fullPolicies[id];
  }
  return {
    recommendedDeviceMemoryGb: 2,
    benchmarkNote: "Draft benchmark budget: capped to 5 seconds.",
  };
}

function toVideoExportPreset(
  definition: RenderPresetDefinition,
  durationMs: number,
  mode: ExportMode,
): DraftExportPreset {
  const policy = fullPolicy(definition.id);
  const frameRate = mode === "full" ? FULL_EXPORT_FRAME_RATE : DRAFT_EXPORT_FRAME_RATE;
  const preset = {
    id: definition.id,
    label: definition.label,
    width: definition.width,
    height: definition.height,
    durationMs,
    frameRate,
    frameCount: Math.ceil((durationMs / 1_000) * frameRate),
    mode,
    recommendedDeviceMemoryGb: policy.recommendedDeviceMemoryGb,
    benchmarkNote: policy.benchmarkNote,
  };
  return mode === "draft" ? { ...preset, maximumDurationMs: durationMs } : preset;
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

export function videoPresetForProject(
  project: EditorProject,
  presetId?: RenderPreset,
): DraftExportPreset {
  const projectPreset = project.visual?.preset;
  const requested = presetId ?? projectPreset;
  return (
    videoExportPresets.find((preset) => preset.id === requested) ?? draftPresetForProject(project)
  );
}

export function draftDurationMs(project: EditorProject, audio: AudioImportResult): number {
  const lineEnd = project.lines.reduce((maximum, line) => Math.max(maximum, line.endMs), 0);
  return Math.max(
    1_000,
    Math.min(DRAFT_EXPORT_MAX_DURATION_MS, audio.durationMs, lineEnd || audio.durationMs),
  );
}

export function exportDurationMs(
  project: EditorProject,
  audio: AudioImportResult,
  preset: DraftExportPreset,
): number {
  if (preset.mode === "draft") return draftDurationMs(project, audio);
  const lineEnd = project.lines.reduce((maximum, line) => Math.max(maximum, line.endMs), 0);
  return Math.max(1_000, Math.min(audio.durationMs, lineEnd || audio.durationMs));
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
  const blockers: string[] = [];
  const durationMs =
    preset.mode === "draft"
      ? Math.min(preset.durationMs, DRAFT_EXPORT_MAX_DURATION_MS)
      : audio.durationMs;
  const frameCount = Math.ceil((durationMs / 1_000) * preset.frameRate);
  const estimatedPixels = preset.width * preset.height * frameCount;
  if (!backend?.supported) reasons.push("No verified WebCodecs WebM backend is available.");
  if (!backend?.supported) blockers.push("Select a supported video backend first.");
  if (preset.mode === "draft" && preset.durationMs >= DRAFT_EXPORT_MAX_DURATION_MS)
    reasons.push("Draft export is capped at 5 seconds.");
  if (preset.mode === "full") reasons.push(preset.benchmarkNote);
  if (estimatedPixels > 1_500_000_000) reasons.push("This export has a high pixel workload.");
  if (
    deviceMemoryGb !== undefined &&
    deviceMemoryGb > 0 &&
    deviceMemoryGb < preset.recommendedDeviceMemoryGb
  ) {
    const message = `Device memory is below the ${preset.recommendedDeviceMemoryGb} GB qualification for this preset.`;
    reasons.push(message);
    if (preset.mode === "full") blockers.push(message);
  }
  if (backend?.id === "mediarecorder-webm" && preset.mode === "full")
    reasons.push(
      "MediaRecorder fallback records rendered canvas frames without deterministic audio muxing.",
    );
  const level =
    blockers.length || estimatedPixels > 2_800_000_000
      ? "high"
      : reasons.length
        ? "moderate"
        : "low";
  return {
    level,
    reasons,
    blockers,
    estimatedFrames: frameCount,
    estimatedPixels,
    qualified: blockers.length === 0,
  };
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
    deterministic: true,
  };
}

export function probeMediaRecorderBackend(): DraftVideoBackend {
  if (
    typeof HTMLCanvasElement === "undefined" ||
    typeof MediaRecorder === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) {
    return mediaRecorderUnavailable("MediaRecorder canvas capture is unavailable.");
  }
  const mimeTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"] as const;
  const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) return mediaRecorderUnavailable("MediaRecorder has no supported WebM MIME type.");
  return {
    id: "mediarecorder-webm",
    label: "WebM fallback (MediaRecorder)",
    container: "webm",
    videoCodec: mimeType.includes("vp8") ? "vp8" : "vp9",
    audioCodec: "opus",
    mimeType,
    supported: true,
    detail: "MediaRecorder canvas fallback is available with preview-rate timing.",
    deterministic: false,
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
    deterministic: true,
  };
}

function mediaRecorderUnavailable(detail: string): DraftVideoBackend {
  return {
    id: "mediarecorder-webm",
    label: "WebM fallback",
    container: "webm",
    videoCodec: "vp9",
    audioCodec: "opus",
    mimeType: "video/webm",
    supported: false,
    detail,
    deterministic: false,
  };
}
