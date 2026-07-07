import { describe, expect, it } from "vitest";
import { canonicalLyricsFromTranscript } from "./alignment";

describe("alignment commands", () => {
  it("derives editable canonical lines from transcript words when no lyrics were supplied", () => {
    const canonical = canonicalLyricsFromTranscript({
      schemaVersion: 1,
      durationMs: 5_000,
      words: [
        { id: "w1", text: "Hello", startMs: 0, endMs: 200 },
        { id: "w2", text: "world", startMs: 240, endMs: 500 },
        { id: "w3", text: "Again", startMs: 2_000, endMs: 2_300 },
      ],
    });
    expect(canonical.sourceText).toBe("Hello world\nAgain");
    expect(canonical.lines.map((line) => line.displayText)).toEqual(["Hello world", "Again"]);
  });
});
