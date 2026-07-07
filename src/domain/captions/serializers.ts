import type { AlignedWord } from "../alignment/engine";
import type { CanonicalToken } from "../lyrics/canonical";
import type { EditorProject } from "../project/schema";
import {
  captionFileName,
  prepareCaptionCues,
  validateMonotonicCues,
  type CaptionCue,
  type CaptionPreparation,
  type CaptionWarning,
} from "./policy";

export type CaptionFormat = "lrc" | "enhanced-lrc" | "srt" | "vtt" | "project-json";

export interface CaptionExport {
  readonly format: CaptionFormat;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: string;
  readonly warnings: readonly CaptionWarning[];
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function lrcTimestamp(ms: number): string {
  const totalCentiseconds = Math.round(ms / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

function srtTimestamp(ms: number): string {
  const rounded = Math.round(ms);
  const milliseconds = rounded % 1000;
  const totalSeconds = Math.floor(rounded / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

function vttTimestamp(ms: number): string {
  return srtTimestamp(ms).replace(",", ".");
}

function safeCueText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").replace(/-->/gu, "-- >");
}

function metadataLines(project: EditorProject, prefix: "lrc" | "vtt"): readonly string[] {
  const facts = [
    ["ti", project.title],
    ["by", "BOLT95"],
    ["length", String(Math.round(project.audio.durationMs / 1000))],
  ] as const;
  if (prefix === "lrc") return facts.map(([key, value]) => `[${key}:${value}]`);
  return facts.map(([key, value]) => `NOTE ${key}: ${value}`);
}

function serializePlainLrc(project: EditorProject, preparation: CaptionPreparation): string {
  return [
    ...metadataLines(project, "lrc"),
    ...preparation.cues.map((cue) => `[${lrcTimestamp(cue.startMs)}]${safeCueText(cue.text)}`),
    "",
  ].join("\n");
}

function wordsForLine(
  project: EditorProject,
  lineId: string,
): readonly { readonly token: CanonicalToken; readonly timing: AlignedWord }[] {
  const tokens = new Map(project.alignment.canonical.tokens.map((token) => [token.id, token]));
  return project.alignment.words
    .map((timing) => {
      const token = tokens.get(timing.canonicalTokenId);
      if (!token || token.lineId !== lineId || token.kind === "annotation") return null;
      if (timing.startMs === undefined || timing.endMs === undefined) return null;
      return { token, timing };
    })
    .filter((entry): entry is { readonly token: CanonicalToken; readonly timing: AlignedWord } =>
      Boolean(entry),
    )
    .sort((left, right) => left.token.index - right.token.index);
}

function serializeEnhancedLrc(
  project: EditorProject,
  preparation: CaptionPreparation,
): { readonly content: string; readonly warnings: readonly CaptionWarning[] } {
  const warnings: CaptionWarning[] = [];
  const lines = preparation.cues.map((cue) => {
    const words = wordsForLine(project, cue.id);
    if (!words.length) {
      warnings.push({
        code: "WORD_TIMING_UNAVAILABLE",
        lineId: cue.id,
        message: "Word timing is unavailable for at least one enhanced LRC line.",
      });
      return `[${lrcTimestamp(cue.startMs)}]${safeCueText(cue.text)}`;
    }
    const wordText = words
      .map(
        ({ token, timing }) =>
          `<${lrcTimestamp(timing.startMs ?? cue.startMs)}>${token.displayText}`,
      )
      .join(" ");
    return `[${lrcTimestamp(cue.startMs)}]${wordText}`;
  });
  return { content: [...metadataLines(project, "lrc"), ...lines, ""].join("\n"), warnings };
}

function serializeSrt(preparation: CaptionPreparation): string {
  return [
    ...preparation.cues.map((cue, index) =>
      [
        String(index + 1),
        `${srtTimestamp(cue.startMs)} --> ${srtTimestamp(cue.endMs)}`,
        safeCueText(cue.text),
      ].join("\n"),
    ),
    "",
  ].join("\n\n");
}

function serializeVtt(project: EditorProject, preparation: CaptionPreparation): string {
  return [
    "WEBVTT",
    "",
    ...metadataLines(project, "vtt"),
    "",
    ...preparation.cues.map((cue) =>
      [`${vttTimestamp(cue.startMs)} --> ${vttTimestamp(cue.endMs)}`, safeCueText(cue.text)].join(
        "\n",
      ),
    ),
    "",
  ].join("\n");
}

export function serializeCaptionExport(
  project: EditorProject,
  format: Exclude<CaptionFormat, "project-json">,
): CaptionExport {
  const preparation = prepareCaptionCues(project);
  const validationWarnings = validateMonotonicCues(preparation.cues);
  if (format === "lrc") {
    return {
      format,
      fileName: captionFileName(project, "lrc"),
      mimeType: "text/plain; charset=utf-8",
      content: serializePlainLrc(project, preparation),
      warnings: [...preparation.warnings, ...validationWarnings],
    };
  }
  if (format === "enhanced-lrc") {
    const enhanced = serializeEnhancedLrc(project, preparation);
    return {
      format,
      fileName: captionFileName(project, "enhanced.lrc"),
      mimeType: "text/plain; charset=utf-8",
      content: enhanced.content,
      warnings: [...preparation.warnings, ...validationWarnings, ...enhanced.warnings],
    };
  }
  if (format === "srt") {
    return {
      format,
      fileName: captionFileName(project, "srt"),
      mimeType: "application/x-subrip; charset=utf-8",
      content: serializeSrt(preparation),
      warnings: [...preparation.warnings, ...validationWarnings],
    };
  }
  return {
    format,
    fileName: captionFileName(project, "vtt"),
    mimeType: "text/vtt; charset=utf-8",
    content: serializeVtt(project, preparation),
    warnings: [...preparation.warnings, ...validationWarnings],
  };
}

export function cuesAreDownloadable(cues: readonly CaptionCue[]): boolean {
  return validateMonotonicCues(cues).length === 0;
}
