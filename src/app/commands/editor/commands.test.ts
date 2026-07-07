import { describe, expect, it, vi } from "vitest";
import { applyEditorCommand, createEditorSession } from "./commands";
import type { EditorProject } from "../../../domain/project/schema";

vi.stubGlobal("crypto", {
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
});

function project(): EditorProject {
  return {
    schemaVersion: 1,
    id: "project-1",
    title: "fixture",
    createdAt: 1,
    updatedAt: 1,
    audio: {
      durationMs: 10_000,
      fingerprint: "a".repeat(64),
      fileName: "fixture.mp3",
      fileSize: 100,
      format: "MP3",
    },
    alignment: {
      schemaVersion: 1,
      engineVersion: "test",
      canonical: {
        schemaVersion: 1,
        format: "txt",
        sourceText: "",
        metadata: [],
        lines: [],
        tokens: [],
      },
      transcript: { schemaVersion: 1, durationMs: 10_000, words: [] },
      words: [],
      lines: [],
      issues: [],
      benchmark: {
        canonicalWords: 0,
        transcriptWords: 0,
        cells: 0,
        elapsedMs: 0,
        hierarchicalAlignmentTriggered: false,
      },
    },
    lines: [
      {
        id: "line-1",
        text: "First line",
        startMs: 1_000,
        endMs: 2_000,
        provenance: "transcript-exact",
        reviewState: "accepted",
      },
      {
        id: "line-2",
        text: "Second line",
        startMs: 3_000,
        endMs: 4_000,
        provenance: "interpolated",
        reviewState: "needs-review",
      },
    ],
  };
}

describe("editor commands", () => {
  it("edits text and restores exact state with undo and redo", () => {
    const session = createEditorSession(project());
    const edited = applyEditorCommand(session, {
      type: "edit-text",
      lineId: "line-1",
      text: "Changed",
    });
    expect(edited.project.lines[0]?.text).toBe("Changed");
    expect(edited.project.lines[0]?.provenance).toBe("manual");

    const undone = applyEditorCommand(edited, { type: "undo" });
    expect(undone.project).toEqual(session.project);

    const redone = applyEditorCommand(undone, { type: "redo" });
    expect(redone.project.lines[0]?.text).toBe("Changed");
  });

  it("rejects overlapping timing while retaining instrumental gaps", () => {
    const session = createEditorSession(project());
    const rejected = applyEditorCommand(session, {
      type: "set-time",
      lineId: "line-2",
      field: "startMs",
      valueMs: 1_500,
    });
    expect(rejected.project).toEqual(session.project);
    expect(rejected.error).toMatch(/overlap/u);

    const accepted = applyEditorCommand(session, {
      type: "set-time",
      lineId: "line-2",
      field: "startMs",
      valueMs: 2_500,
    });
    expect(accepted.project.lines[1]?.startMs).toBe(2_500);
  });

  it("allows shortening one line when another pair already overlaps", () => {
    const dirtyProject: EditorProject = {
      ...project(),
      lines: [
        {
          id: "line-1",
          text: "First line",
          startMs: 1_000,
          endMs: 2_000,
          provenance: "transcript-exact",
          reviewState: "accepted",
        },
        {
          id: "line-2",
          text: "Second line",
          startMs: 3_000,
          endMs: 4_000,
          provenance: "interpolated",
          reviewState: "needs-review",
        },
        {
          id: "line-3",
          text: "Third line",
          startMs: 3_500,
          endMs: 5_000,
          provenance: "interpolated",
          reviewState: "needs-review",
        },
      ],
    };

    const edited = applyEditorCommand(createEditorSession(dirtyProject), {
      type: "set-boundary-at-playhead",
      lineId: "line-1",
      field: "endMs",
      playheadMs: 1_500,
    });

    expect(edited.error).toBeNull();
    expect(edited.project.lines[0]?.endMs).toBe(1_500);
  });

  it("splits and merges without losing timing bounds", () => {
    const split = applyEditorCommand(createEditorSession(project()), {
      type: "split",
      lineId: "line-1",
      offset: 5,
    });
    expect(split.project.lines).toHaveLength(3);
    expect(split.project.lines[0]?.endMs).toBe(split.project.lines[1]?.startMs);

    const merged = applyEditorCommand(split, { type: "merge-next", lineId: "line-1" });
    expect(merged.project.lines).toHaveLength(2);
    expect(merged.project.lines[0]?.text).toBe("First line");
  });
});
