import type { EditorProject } from "../project/schema";

export interface FrameWord {
  readonly text: string;
  readonly active: boolean;
}

export interface FrameLine {
  readonly id: string;
  readonly text: string;
  readonly role: "previous" | "current" | "next";
  readonly words: readonly FrameWord[];
}

export interface FrameLyrics {
  readonly previous?: FrameLine;
  readonly current?: FrameLine;
  readonly next?: FrameLine;
}

function wordsForLine(
  project: EditorProject,
  lineId: string,
  timeMs: number,
): readonly FrameWord[] {
  const canonicalLine = project.alignment.canonical.lines.find((line) => line.id === lineId);
  if (!canonicalLine) return [];
  const tokens = canonicalLine.tokenIds
    .map((id) => project.alignment.canonical.tokens.find((token) => token.id === id))
    .filter((token) => token && token.kind !== "annotation");
  return tokens.map((token) => {
    const aligned = project.alignment.words.find((word) => word.canonicalTokenId === token!.id);
    return {
      text: token!.displayText,
      active:
        aligned?.startMs !== undefined &&
        aligned.endMs !== undefined &&
        timeMs >= aligned.startMs &&
        timeMs < aligned.endMs,
    };
  });
}

function frameLine(
  project: EditorProject,
  index: number,
  role: FrameLine["role"],
  timeMs: number,
): FrameLine | undefined {
  const line = project.lines[index];
  if (!line) return undefined;
  return {
    id: line.id,
    text: line.text,
    role,
    words: wordsForLine(project, line.id, timeMs),
  };
}

export function activeLineIndex(project: EditorProject, timeMs: number): number {
  const active = project.lines.findIndex((line) => timeMs >= line.startMs && timeMs < line.endMs);
  if (active >= 0) return active;
  const next = project.lines.findIndex((line) => line.startMs > timeMs);
  return next >= 0 ? next : Math.max(0, project.lines.length - 1);
}

export function lyricsForFrame(project: EditorProject, timeMs: number): FrameLyrics {
  if (project.lines.length === 0) return {};
  const index = activeLineIndex(project, timeMs);
  const previous = frameLine(project, index - 1, "previous", timeMs);
  const current = frameLine(project, index, "current", timeMs);
  const next = frameLine(project, index + 1, "next", timeMs);
  return {
    ...(previous ? { previous } : {}),
    ...(current ? { current } : {}),
    ...(next ? { next } : {}),
  };
}
