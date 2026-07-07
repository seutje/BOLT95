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
    const file = serializeProjectFile(
      {
        ...project,
        visual: {
          schemaVersion: 1,
          preset: "square-draft",
          backgroundColor: "#101018",
          textColor: "#ffffff",
          adjacentTextColor: "#d8d8d8",
          highlightColor: "#ffff66",
          outlineColor: "#000000",
          fontFamily: "system",
          fontScale: 1,
          verticalPosition: 0.58,
          textAlign: "center",
          showAdjacentLines: true,
          showWordHighlight: true,
          highContrast: true,
          transition: "fade",
          backgroundBlur: 8,
          backgroundImage: {
            fileName: "local.png",
            fileSize: 100,
            fingerprint: "a".repeat(64),
          },
        },
      },
      { appVersion: "test" },
      10,
    );
    expect(JSON.stringify(file)).not.toContain("data:");
    expect(JSON.stringify(file)).not.toContain("blob:");
    expect(parseProjectFile(file).project.audio.fingerprint).toBe("b".repeat(64));
    expect(parseProjectFile(file).project.visual?.backgroundImage?.fileName).toBe("local.png");
  });

  it("rejects future project files before mutation", () => {
    expect(() => parseProjectFile({ schemaVersion: 99 })).toThrow(/Unsupported/u);
  });

  it("sanitizes export names", () => {
    expect(projectExportName(project)).toBe("Unsafe-Project-Name.bolt95.json");
  });
});
