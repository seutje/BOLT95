import { describe, expect, it } from "vitest";
import type { EditorProject } from "../project/schema";
import { prepareCaptionCues } from "./policy";
import { serializeCaptionExport } from "./serializers";

const fingerprint = "a".repeat(64);

function projectFixture(overrides: Partial<EditorProject> = {}): EditorProject {
  const project: EditorProject = {
    schemaVersion: 1,
    id: "project-1",
    title: "../Café Export?",
    createdAt: 1,
    updatedAt: 2,
    audio: {
      durationMs: 3_726_250,
      fingerprint,
      fileName: "audio.mp3",
      fileSize: 100,
      format: "MP3",
    },
    alignment: {
      schemaVersion: 1,
      engineVersion: "test",
      canonical: {
        schemaVersion: 1,
        format: "txt",
        sourceText: "Café déjà vu\n[chorus]\nLast line",
        metadata: [],
        lines: [
          {
            schemaVersion: 1,
            id: "line-1",
            displayText: "Café déjà vu",
            leadingWhitespace: "",
            trailingWhitespace: "",
            sourceStart: 0,
            sourceEnd: 12,
            stanza: 0,
            blank: false,
            timestamps: [],
            tokenIds: ["token-1", "token-2", "token-3"],
          },
          {
            schemaVersion: 1,
            id: "line-annotation",
            displayText: "[chorus]",
            leadingWhitespace: "",
            trailingWhitespace: "",
            sourceStart: 13,
            sourceEnd: 21,
            stanza: 0,
            blank: false,
            annotation: "chorus",
            timestamps: [],
            tokenIds: ["token-annotation"],
          },
          {
            schemaVersion: 1,
            id: "line-2",
            displayText: "Last line",
            leadingWhitespace: "",
            trailingWhitespace: "",
            sourceStart: 22,
            sourceEnd: 31,
            stanza: 0,
            blank: false,
            timestamps: [],
            tokenIds: ["token-4", "token-5"],
          },
        ],
        tokens: [
          {
            schemaVersion: 1,
            id: "token-1",
            lineId: "line-1",
            index: 0,
            displayText: "Café",
            normalized: ["cafe"],
            sourceStart: 0,
            sourceEnd: 4,
            kind: "word",
          },
          {
            schemaVersion: 1,
            id: "token-2",
            lineId: "line-1",
            index: 1,
            displayText: "déjà",
            normalized: ["deja"],
            sourceStart: 5,
            sourceEnd: 9,
            kind: "word",
          },
          {
            schemaVersion: 1,
            id: "token-3",
            lineId: "line-1",
            index: 2,
            displayText: "vu",
            normalized: ["vu"],
            sourceStart: 10,
            sourceEnd: 12,
            kind: "word",
          },
          {
            schemaVersion: 1,
            id: "token-annotation",
            lineId: "line-annotation",
            index: 0,
            displayText: "[chorus]",
            normalized: ["chorus"],
            sourceStart: 13,
            sourceEnd: 21,
            kind: "annotation",
          },
          {
            schemaVersion: 1,
            id: "token-4",
            lineId: "line-2",
            index: 0,
            displayText: "Last",
            normalized: ["last"],
            sourceStart: 22,
            sourceEnd: 26,
            kind: "word",
          },
          {
            schemaVersion: 1,
            id: "token-5",
            lineId: "line-2",
            index: 1,
            displayText: "line",
            normalized: ["line"],
            sourceStart: 27,
            sourceEnd: 31,
            kind: "word",
          },
        ],
      },
      transcript: { schemaVersion: 1, durationMs: 3_726_250, words: [] },
      words: [
        {
          canonicalTokenId: "token-1",
          transcriptWordId: "word-1",
          startMs: 1_005,
          endMs: 1_200,
          score: 2,
          confidence: 1,
          provenance: "transcript-exact",
        },
        {
          canonicalTokenId: "token-2",
          transcriptWordId: "word-2",
          startMs: 1_245,
          endMs: 1_500,
          score: 2,
          confidence: 1,
          provenance: "transcript-exact",
        },
        {
          canonicalTokenId: "token-3",
          transcriptWordId: "word-3",
          startMs: 1_555,
          endMs: 1_800,
          score: 2,
          confidence: 1,
          provenance: "transcript-exact",
        },
      ],
      lines: [],
      issues: [],
      benchmark: {
        canonicalWords: 5,
        transcriptWords: 5,
        cells: 25,
        elapsedMs: 1,
        hierarchicalAlignmentTriggered: false,
      },
    },
    lines: [
      {
        id: "line-1",
        text: "Café déjà vu",
        startMs: 1_005,
        endMs: 1_996,
        provenance: "manual",
        reviewState: "accepted",
      },
      {
        id: "line-annotation",
        text: "[chorus]",
        startMs: 2_000,
        endMs: 2_400,
        provenance: "manual",
        reviewState: "accepted",
      },
      {
        id: "line-2",
        text: "Last line",
        startMs: 3_725_900,
        endMs: 3_726_100,
        provenance: "interpolated",
        reviewState: "needs-review",
      },
    ],
  };
  return { ...project, ...overrides };
}

describe("caption serializers", () => {
  it("exports plain LRC with Unicode text, rounded centiseconds, and safe names", () => {
    const exported = serializeCaptionExport(projectFixture(), "lrc");
    expect(exported.fileName).toBe("Cafe-Export.lrc");
    expect(exported.content).toContain("[00:01.01]Café déjà vu");
    expect(exported.content).toContain("[62:05.90]Last line");
    expect(exported.content).not.toContain("[chorus]");
    expect(exported.warnings.map((warning) => warning.code)).toContain(
      "EMPTY_OR_ANNOTATION_SKIPPED",
    );
  });

  it("exports enhanced LRC with word timestamps when alignment words exist", () => {
    const exported = serializeCaptionExport(projectFixture(), "enhanced-lrc");
    expect(exported.fileName).toBe("Cafe-Export.enhanced.lrc");
    expect(exported.content).toContain("[00:01.01]<00:01.01>Café <00:01.25>déjà <00:01.56>vu");
  });

  it("exports SRT and WebVTT hour timestamps with repaired cue durations", () => {
    const project = projectFixture();
    const srt = serializeCaptionExport(project, "srt");
    const vtt = serializeCaptionExport(project, "vtt");
    expect(srt.content).toContain("01:02:05,900 --> 01:02:06,250");
    expect(vtt.content).toContain("01:02:05.900 --> 01:02:06.250");
    expect(prepareCaptionCues(project).cues.at(-1)?.endMs).toBe(project.audio.durationMs);
  });

  it("repairs overlapping cues into monotonic output and reports a warning", () => {
    const project = projectFixture({
      lines: [
        {
          id: "line-1",
          text: "First",
          startMs: 1_000,
          endMs: 2_000,
          provenance: "manual",
          reviewState: "accepted",
        },
        {
          id: "line-2",
          text: "Second",
          startMs: 1_500,
          endMs: 2_300,
          provenance: "manual",
          reviewState: "accepted",
        },
      ],
    });
    const preparation = prepareCaptionCues(project);
    expect(preparation.cues.map((cue) => cue.startMs)).toEqual([1_000, 2_000]);
    expect(preparation.warnings.map((warning) => warning.code)).toContain("TIMING_REPAIRED");
  });
});
