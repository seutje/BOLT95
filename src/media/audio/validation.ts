import { AppError } from "../../app/errors/AppError";
import type { ProcessingRisk } from "./types";

export interface AudioImportLimits {
  readonly moderateBytes: number;
  readonly highBytes: number;
  readonly maximumBytes: number;
  readonly moderateDurationMs: number;
  readonly highDurationMs: number;
  readonly maximumDurationMs: number;
}

export const DEFAULT_AUDIO_LIMITS: AudioImportLimits = {
  moderateBytes: 25 * 1024 * 1024,
  highBytes: 75 * 1024 * 1024,
  maximumBytes: 250 * 1024 * 1024,
  moderateDurationMs: 10 * 60_000,
  highDurationMs: 25 * 60_000,
  maximumDurationMs: 90 * 60_000,
};

const acceptedMimeTypes = new Set(["", "audio/mpeg", "audio/mp3"]);

function invalid(message: string, technicalDetail: string): AppError {
  return new AppError("INPUT_INVALID", message, {
    technicalDetail,
    recoveryAction: "Choose a valid MP3 file and try again.",
  });
}

export async function validateAudioFile(
  file: File,
  limits: AudioImportLimits = DEFAULT_AUDIO_LIMITS,
): Promise<void> {
  if (file.size === 0) throw invalid("The selected audio file is empty.", "zero-byte input");
  if (file.size > limits.maximumBytes) {
    throw invalid(
      "The selected audio exceeds the 250 MB safety limit.",
      `input bytes ${file.size} exceed ${limits.maximumBytes}`,
    );
  }

  const extensionMatches = file.name.toLocaleLowerCase().endsWith(".mp3");
  if (!extensionMatches || !acceptedMimeTypes.has(file.type.toLocaleLowerCase())) {
    throw invalid(
      "File type and extension must identify an MP3.",
      `extension=${extensionMatches}; mime=${file.type || "missing"}`,
    );
  }

  const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  const id3 = header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33;
  const frameSync = header[0] === 0xff && (header[1] ?? 0) >= 0xe0;
  if (!id3 && !frameSync) {
    throw invalid("The selected file does not contain an MP3 header.", "missing ID3/frame sync");
  }
}

export function validateDecodedDuration(
  durationMs: number,
  limits: AudioImportLimits = DEFAULT_AUDIO_LIMITS,
): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw invalid("The MP3 has no usable audio duration.", `decoded duration=${durationMs}`);
  }
  if (durationMs > limits.maximumDurationMs) {
    throw invalid(
      "The MP3 exceeds the 90 minute safety limit.",
      `duration ${durationMs} exceeds ${limits.maximumDurationMs}`,
    );
  }
}

export function estimateProcessingRisk(
  bytes: number,
  durationMs: number,
  limits: AudioImportLimits = DEFAULT_AUDIO_LIMITS,
): { risk: ProcessingRisk; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (bytes >= limits.highBytes) {
    score = 2;
    reasons.push("large file size");
  } else if (bytes >= limits.moderateBytes) {
    score = Math.max(score, 1);
    reasons.push("moderate file size");
  }
  if (durationMs >= limits.highDurationMs) {
    score = 2;
    reasons.push("long track duration");
  } else if (durationMs >= limits.moderateDurationMs) {
    score = Math.max(score, 1);
    reasons.push("moderate track duration");
  }
  return { risk: score === 2 ? "high" : score === 1 ? "moderate" : "low", reasons };
}
