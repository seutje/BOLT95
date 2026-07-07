import { describe, expect, it } from "vitest";
import { alignCanonicalLyrics } from "../alignment/engine";
import { createCanonicalLyrics } from "../lyrics/canonical";
import { parseLyrics } from "../lyrics/parser";
import type { EditorProject } from "../project/schema";
import { defaultVisualTheme } from "./schema";
import { activeLineIndex, lyricsForFrame } from "./timing";

function project(): EditorProject {
  const canonical = createCanonicalLyrics(parseLyrics("Hello world\nNext line\n", "txt"));
  const alignment = alignCanonicalLyrics(canonical, {
    schemaVersion: 1,
    durationMs: 4_000,
    words: [
      { id: "w1", text: "hello", startMs: 500, endMs: 900, confidence: 1 },
      { id: "w2", text: "world", startMs: 950, endMs: 1_300, confidence: 1 },
      { id: "w3", text: "next", startMs: 1_800, endMs: 2_100, confidence: 1 },
      { id: "w4", text: "line", startMs: 2_120, endMs: 2_450, confidence: 1 },
    ],
  });
  return {
    schemaVersion: 1,
    id: "p",
    title: "Preview",
    createdAt: 1,
    updatedAt: 1,
    audio: {
      durationMs: 4_000,
      fingerprint: "a".repeat(64),
      fileName: "preview.mp3",
      fileSize: 1,
      format: "MP3",
    },
    alignment,
    lines: alignment.lines.map((line) => ({
      id: line.lineId,
      text: line.displayText,
      startMs: line.startMs ?? 0,
      endMs: line.endMs ?? 0,
      provenance: line.provenance === "unresolved" ? "interpolated" : line.provenance,
      reviewState: line.reviewState,
    })),
    visual: defaultVisualTheme,
  };
}

describe("preview timing selection", () => {
  it("finds current, previous, next, and active word from project timing", () => {
    const fixture = project();
    expect(activeLineIndex(fixture, 1_000)).toBe(0);
    const lyrics = lyricsForFrame(fixture, 1_000);
    expect(lyrics.current?.text).toBe("Hello world");
    expect(lyrics.next?.text).toBe("Next line");
    expect(lyrics.current?.words).toContainEqual({ text: "world", active: true });
  });
});
