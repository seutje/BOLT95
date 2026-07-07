import { describe, expect, it } from "vitest";
import { parseProjectFile, projectExportName, serializeProjectFile } from "./project";
import type { EditorProject } from "../../../domain/project/schema";

const project: EditorProject = {
  schemaVersion: 1,
  id: "project-1",
  title: "../Unsafe Project Name?",
  createdAt: 1,
  updatedAt: 2,
  audio: {
    durationMs: 1_000,
    fingerprint: "b".repeat(64),
    fileName: "audio.mp3",
    fileSize: 10,
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
    transcript: { schemaVersion: 1, durationMs: 1_000, words: [] },
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
  lines: [],
};

describe("project JSON", () => {
  it("round-trips versioned project JSON without audio bytes", () => {
    const file = serializeProjectFile(project, { appVersion: "test" }, 10);
    expect(JSON.stringify(file)).not.toContain("data:");
    expect(parseProjectFile(file).project.audio.fingerprint).toBe("b".repeat(64));
  });

  it("rejects future project files before mutation", () => {
    expect(() => parseProjectFile({ schemaVersion: 99 })).toThrow(/Unsupported/u);
  });

  it("sanitizes export names", () => {
    expect(projectExportName(project)).toBe("Unsafe-Project-Name.bolt95.json");
  });
});
