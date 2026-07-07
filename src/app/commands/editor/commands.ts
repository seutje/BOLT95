import type { ReviewState } from "../../../domain/lyrics/canonical";
import {
  editorProjectSchemaV1,
  type EditorLine,
  type EditorProject,
} from "../../../domain/project/schema";

export interface EditorPatch {
  readonly beforeLines: readonly EditorLine[];
  readonly afterLines: readonly EditorLine[];
  readonly beforeUpdatedAt: number;
  readonly afterUpdatedAt: number;
  readonly beforeSelectedLineId: string | null;
  readonly afterSelectedLineId: string | null;
}

export interface EditorHistory {
  readonly past: readonly EditorPatch[];
  readonly future: readonly EditorPatch[];
  readonly limit: number;
}

export interface EditorSession {
  readonly project: EditorProject;
  readonly history: EditorHistory;
  readonly selectedLineId: string | null;
  readonly error: string | null;
}

export type EditorCommand =
  | { readonly type: "select"; readonly lineId: string | null }
  | { readonly type: "edit-text"; readonly lineId: string; readonly text: string }
  | {
      readonly type: "set-time";
      readonly lineId: string;
      readonly field: "startMs" | "endMs";
      readonly valueMs: number;
    }
  | { readonly type: "nudge"; readonly lineId: string; readonly deltaMs: number }
  | { readonly type: "split"; readonly lineId: string; readonly offset: number }
  | { readonly type: "merge-next"; readonly lineId: string }
  | { readonly type: "set-reviewed"; readonly lineId: string; readonly reviewState: ReviewState }
  | {
      readonly type: "set-boundary-at-playhead";
      readonly lineId: string;
      readonly field: "startMs" | "endMs";
      readonly playheadMs: number;
    }
  | { readonly type: "undo" }
  | { readonly type: "redo" };

export function createEditorSession(project: EditorProject, limit = 60): EditorSession {
  return {
    project,
    selectedLineId: project.lines[0]?.id ?? null,
    error: null,
    history: { past: [], future: [], limit },
  };
}

function withUpdated(project: EditorProject, lines: readonly EditorLine[]): EditorProject {
  return editorProjectSchemaV1.parse({ ...project, updatedAt: Date.now(), lines });
}

function findIndex(project: EditorProject, lineId: string): number {
  return project.lines.findIndex((line) => line.id === lineId);
}

function timingError(lines: readonly EditorLine[], durationMs: number): string | null {
  for (const [index, line] of lines.entries()) {
    if (line.startMs < 0 || line.endMs > durationMs)
      return "Timing must stay within the audio duration.";
    if (line.endMs < line.startMs) return "Line end must not be before line start.";
    const previous = lines[index - 1];
    if (previous && line.startMs < previous.endMs)
      return "Line timing cannot overlap the previous line.";
    const next = lines[index + 1];
    if (next && line.endMs > next.startMs) return "Line timing cannot overlap the next line.";
  }
  return null;
}

function withLines(
  project: EditorProject,
  lines: readonly EditorLine[],
  updatedAt: number,
): EditorProject {
  return editorProjectSchemaV1.parse({ ...project, updatedAt, lines });
}

function pushHistory(
  session: EditorSession,
  nextProject: EditorProject,
  selectedLineId: string | null,
): EditorSession {
  const patch: EditorPatch = {
    beforeLines: session.project.lines,
    afterLines: nextProject.lines,
    beforeUpdatedAt: session.project.updatedAt,
    afterUpdatedAt: nextProject.updatedAt,
    beforeSelectedLineId: session.selectedLineId,
    afterSelectedLineId: selectedLineId,
  };
  const past = [...session.history.past, patch].slice(-session.history.limit);
  return {
    ...session,
    project: nextProject,
    selectedLineId,
    error: null,
    history: { ...session.history, past, future: [] },
  };
}

function editLines(
  session: EditorSession,
  mutate: (lines: EditorLine[]) => EditorLine[],
  selectedLineId = session.selectedLineId,
): EditorSession {
  const lines = mutate([...session.project.lines]);
  const error = timingError(lines, session.project.audio.durationMs);
  if (error) return { ...session, error };
  return pushHistory(session, withUpdated(session.project, lines), selectedLineId);
}

function updateLine(
  session: EditorSession,
  lineId: string,
  update: (line: EditorLine) => EditorLine,
): EditorSession {
  const index = findIndex(session.project, lineId);
  if (index < 0) return { ...session, error: "The selected line no longer exists." };
  return editLines(
    session,
    (lines) => {
      lines[index] = update(lines[index]!);
      return lines;
    },
    lineId,
  );
}

function splitLine(session: EditorSession, lineId: string, offset: number): EditorSession {
  const index = findIndex(session.project, lineId);
  const line = session.project.lines[index];
  if (!line) return { ...session, error: "The selected line no longer exists." };
  const clampedOffset = Math.max(1, Math.min(line.text.length - 1, offset));
  if (!Number.isFinite(clampedOffset) || clampedOffset <= 0 || clampedOffset >= line.text.length) {
    return { ...session, error: "Choose a split point inside the line text." };
  }
  const left = line.text.slice(0, clampedOffset).trimEnd();
  const right = line.text.slice(clampedOffset).trimStart();
  if (!left || !right) return { ...session, error: "Split must leave text on both sides." };
  const midpoint = Math.round((line.startMs + line.endMs) / 2);
  const first: EditorLine = {
    ...line,
    text: left,
    endMs: midpoint,
    provenance: "manual",
    reviewState: "needs-review",
  };
  const second: EditorLine = {
    ...line,
    id: `${line.id}-split-${crypto.randomUUID()}`,
    text: right,
    startMs: midpoint,
    provenance: "manual",
    reviewState: "needs-review",
  };
  return editLines(
    session,
    (lines) => {
      lines.splice(index, 1, first, second);
      return lines;
    },
    second.id,
  );
}

function mergeNext(session: EditorSession, lineId: string): EditorSession {
  const index = findIndex(session.project, lineId);
  const line = session.project.lines[index];
  const next = session.project.lines[index + 1];
  if (!line || !next) return { ...session, error: "There is no following line to merge." };
  return editLines(
    session,
    (lines) => {
      lines.splice(index, 2, {
        ...line,
        text: `${line.text}${line.text && next.text ? " " : ""}${next.text}`,
        endMs: next.endMs,
        provenance: "manual",
        reviewState: "needs-review",
      });
      return lines;
    },
    line.id,
  );
}

export function applyEditorCommand(session: EditorSession, command: EditorCommand): EditorSession {
  switch (command.type) {
    case "select":
      return { ...session, selectedLineId: command.lineId, error: null };
    case "edit-text":
      return updateLine(session, command.lineId, (line) => ({
        ...line,
        text: command.text,
        provenance: "manual",
        reviewState: "needs-review",
      }));
    case "set-time":
      return updateLine(session, command.lineId, (line) => ({
        ...line,
        [command.field]: Math.round(command.valueMs),
        provenance: "manual",
      }));
    case "nudge":
      return updateLine(session, command.lineId, (line) => ({
        ...line,
        startMs: Math.round(line.startMs + command.deltaMs),
        endMs: Math.round(line.endMs + command.deltaMs),
        provenance: "manual",
      }));
    case "split":
      return splitLine(session, command.lineId, command.offset);
    case "merge-next":
      return mergeNext(session, command.lineId);
    case "set-reviewed":
      return updateLine(session, command.lineId, (line) => ({
        ...line,
        reviewState: command.reviewState,
        provenance: "manual",
      }));
    case "set-boundary-at-playhead":
      return applyEditorCommand(session, {
        type: "set-time",
        lineId: command.lineId,
        field: command.field,
        valueMs: command.playheadMs,
      });
    case "undo": {
      const patch = session.history.past.at(-1);
      if (!patch) return { ...session, error: null };
      return {
        ...session,
        project: withLines(session.project, patch.beforeLines, patch.beforeUpdatedAt),
        selectedLineId: patch.beforeSelectedLineId,
        error: null,
        history: {
          ...session.history,
          past: session.history.past.slice(0, -1),
          future: [patch, ...session.history.future].slice(0, session.history.limit),
        },
      };
    }
    case "redo": {
      const patch = session.history.future[0];
      if (!patch) return { ...session, error: null };
      return {
        ...session,
        project: withLines(session.project, patch.afterLines, patch.afterUpdatedAt),
        selectedLineId: patch.afterSelectedLineId,
        error: null,
        history: {
          ...session.history,
          past: [...session.history.past, patch].slice(-session.history.limit),
          future: session.history.future.slice(1),
        },
      };
    }
  }
}
