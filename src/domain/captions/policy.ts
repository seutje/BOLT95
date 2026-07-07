import type { EditorProject } from "../project/schema";

export const CAPTION_MIN_CUE_DURATION_MS = 500;

export interface CaptionCue {
  readonly id: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly reviewState: EditorProject["lines"][number]["reviewState"];
  readonly provenance: EditorProject["lines"][number]["provenance"];
}

export interface CaptionWarning {
  readonly code:
    | "EMPTY_OR_ANNOTATION_SKIPPED"
    | "LOW_CONFIDENCE"
    | "TIMING_REPAIRED"
    | "UNRESOLVED_TIMING"
    | "WORD_TIMING_UNAVAILABLE";
  readonly message: string;
  readonly lineId?: string;
}

export interface CaptionPreparation {
  readonly cues: readonly CaptionCue[];
  readonly warnings: readonly CaptionWarning[];
}

function canonicalLineById(
  project: EditorProject,
): ReadonlyMap<string, { readonly annotation: string | undefined }> {
  return new Map(
    project.alignment.canonical.lines.map((line) => [
      line.id,
      {
        annotation: line.annotation,
      },
    ]),
  );
}

export function prepareCaptionCues(project: EditorProject): CaptionPreparation {
  const warnings: CaptionWarning[] = [];
  const cues: CaptionCue[] = [];
  const canonicalLines = canonicalLineById(project);
  let previousEndMs = 0;

  for (const line of project.lines) {
    const text = line.text.trim();
    const canonical = canonicalLines.get(line.id);
    if (!text || canonical?.annotation) {
      warnings.push({
        code: "EMPTY_OR_ANNOTATION_SKIPPED",
        lineId: line.id,
        message: "Empty and annotation-only lines are omitted from timed-text exports.",
      });
      continue;
    }

    if (line.reviewState === "unresolved") {
      warnings.push({
        code: "UNRESOLVED_TIMING",
        lineId: line.id,
        message: "A line is unresolved and should be reviewed before export.",
      });
    } else if (line.reviewState !== "accepted") {
      warnings.push({
        code: "LOW_CONFIDENCE",
        lineId: line.id,
        message: "A line still needs review and may export with imperfect timing.",
      });
    }

    let startMs = Math.round(line.startMs);
    let endMs = Math.round(line.endMs);
    const originalStartMs = startMs;
    const originalEndMs = endMs;
    startMs = Math.max(previousEndMs, Math.min(project.audio.durationMs, startMs));
    endMs = Math.max(startMs + CAPTION_MIN_CUE_DURATION_MS, endMs);
    endMs = Math.min(project.audio.durationMs, endMs);
    if (endMs < startMs) endMs = startMs;

    if (startMs !== originalStartMs || endMs !== originalEndMs) {
      warnings.push({
        code: "TIMING_REPAIRED",
        lineId: line.id,
        message: "A cue was clamped to the project duration or repaired to avoid overlap.",
      });
    }

    cues.push({
      id: line.id,
      text,
      startMs,
      endMs,
      reviewState: line.reviewState,
      provenance: line.provenance,
    });
    previousEndMs = endMs;
  }

  return { cues, warnings };
}

export function validateMonotonicCues(cues: readonly CaptionCue[]): readonly CaptionWarning[] {
  const warnings: CaptionWarning[] = [];
  let previousEndMs = 0;
  for (const cue of cues) {
    if (cue.startMs < previousEndMs || cue.endMs < cue.startMs) {
      warnings.push({
        code: "TIMING_REPAIRED",
        lineId: cue.id,
        message: "Caption cue timing is not monotonic.",
      });
    }
    previousEndMs = cue.endMs;
  }
  return warnings;
}

export function captionBaseName(project: EditorProject): string {
  return (
    project.title
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^\.+/u, "")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 80) || "bolt95-export"
  );
}

export function captionFileName(project: EditorProject, extension: string): string {
  const cleanExtension = extension.replace(/[^a-z0-9.]/giu, "").replace(/^\.+/u, "");
  return `${captionBaseName(project)}.${cleanExtension || "txt"}`;
}
