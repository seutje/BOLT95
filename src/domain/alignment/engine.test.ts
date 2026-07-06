import { describe, expect, it } from "vitest";
import { createCanonicalLyrics, reconstructCanonicalSource } from "../lyrics/canonical";
import { parseLyrics } from "../lyrics/parser";
import { alignCanonicalLyrics } from "./engine";
import { alignmentFixtures, canonicalFixture } from "../../test/fixtures/alignment/fixtures";

function fixture(id: string) {
  const match = alignmentFixtures.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing fixture ${id}`);
  return match;
}

function expectPersistedTimesValid(result: ReturnType<typeof alignCanonicalLyrics>) {
  let previous = 0;
  for (const line of result.lines) {
    if (line.startMs === undefined || line.endMs === undefined) continue;
    expect(Number.isInteger(line.startMs)).toBe(true);
    expect(Number.isInteger(line.endMs)).toBe(true);
    expect(line.startMs).toBeGreaterThanOrEqual(previous);
    expect(line.endMs).toBeGreaterThanOrEqual(line.startMs);
    expect(line.endMs).toBeLessThanOrEqual(result.transcript.durationMs);
    previous = line.endMs;
  }
  for (const word of result.words) {
    if (word.startMs === undefined || word.endMs === undefined) continue;
    expect(Number.isInteger(word.startMs)).toBe(true);
    expect(Number.isInteger(word.endMs)).toBe(true);
    expect(word.startMs).toBeGreaterThanOrEqual(0);
    expect(word.endMs).toBeLessThanOrEqual(result.transcript.durationMs);
  }
}

describe("alignment engine", () => {
  it("aligns the exact fixture and reconstructs canonical input byte-for-byte", () => {
    const sample = fixture("exact");
    const canonical = createCanonicalLyrics(parseLyrics(sample.lyricsText, "txt"));
    const result = alignCanonicalLyrics(canonical, sample.transcript);
    expect(reconstructCanonicalSource(result.canonical)).toBe(sample.lyricsText);
    expect(result.lines.filter((line) => line.reviewState === "accepted").length).toBeGreaterThan(
      1,
    );
    expect(result.words.every((word) => word.provenance !== "unresolved")).toBe(true);
    expectPersistedTimesValid(result);
  });

  it.each([
    "substitutions",
    "fillers",
    "instrumental-gap",
    "contractions-numbers-accents",
    "non-english",
  ])("handles %s fixture with bounded monotonic timing", (id) => {
    const sample = fixture(id);
    const result = alignCanonicalLyrics(canonicalFixture(id), sample.transcript);
    expect(reconstructCanonicalSource(result.canonical)).toBe(sample.lyricsText);
    expectPersistedTimesValid(result);
    expect(result.benchmark.hierarchicalAlignmentTriggered).toBe(false);
  });

  it("marks repeated choruses ambiguous without backward jumps", () => {
    const sample = fixture("repeated-chorus");
    const result = alignCanonicalLyrics(canonicalFixture(sample.id), sample.transcript);
    expect(result.issues.some((issue) => issue.code === "REPEATED_BLOCK")).toBe(true);
    expect(result.lines.filter((line) => line.ambiguous).length).toBe(3);
    expectPersistedTimesValid(result);
  });

  it("keeps manual line timings over future automatic runs", () => {
    const sample = fixture("exact");
    const canonical = canonicalFixture(sample.id);
    const result = alignCanonicalLyrics(canonical, sample.transcript, {
      manualLineTimings: [{ lineId: "line-2", startMs: 3_000, endMs: 4_000 }],
    });
    const manual = result.lines.find((line) => line.lineId === "line-2");
    expect(manual?.provenance).toBe("manual");
    expect(manual?.startMs).toBe(3_000);
    expect(manual?.endMs).toBe(4_000);
    expect(manual?.reviewState).toBe("accepted");
  });

  it("leaves silence unresolved and flags wrong-song evidence", () => {
    const silence = alignCanonicalLyrics(
      canonicalFixture("silence"),
      fixture("silence").transcript,
    );
    expect(silence.lines.some((line) => line.reviewState === "unresolved")).toBe(true);
    expect(silence.issues.some((issue) => issue.code === "WRONG_SONG_LIKELY")).toBe(true);

    const wrong = alignCanonicalLyrics(
      canonicalFixture("wrong-song"),
      fixture("wrong-song").transcript,
    );
    expect(wrong.issues.some((issue) => issue.code === "WRONG_SONG_LIKELY")).toBe(true);
  });

  it("benchmarks long flat DP within the hierarchical-alignment trigger gate", () => {
    const lyricWords = Array.from({ length: 180 }, (_, index) => `word${index}`).join(" ");
    const canonical = createCanonicalLyrics(parseLyrics(lyricWords, "txt"));
    const transcript = {
      schemaVersion: 1 as const,
      durationMs: 120_000,
      words: Array.from({ length: 180 }, (_, index) => ({
        id: `word-${index}`,
        text: `word${index}`,
        startMs: index * 500,
        endMs: index * 500 + 250,
      })),
    };
    const result = alignCanonicalLyrics(canonical, transcript);
    expect(result.benchmark.cells).toBe(181 * 181);
    expect(result.benchmark.elapsedMs).toBeLessThan(1_000);
    expect(result.benchmark.hierarchicalAlignmentTriggered).toBe(false);
  });
});
