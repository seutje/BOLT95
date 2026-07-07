import { describe, expect, it } from "vitest";
import { parseLyrics } from "./parser";

const MALFORMED_LYRICS = [
  "",
  "\u0000\u0001\u0002",
  "[999:99.999]timestamp with unusual range",
  "[00:00.001][bad]mixed tags",
  "[ar:".repeat(100),
  "line\r\n".repeat(2000),
  "\uFEFF[00:01.0]bom line",
] as const;

describe("lyrics parser boundary inputs", () => {
  it.each(MALFORMED_LYRICS)("parses malformed input without throwing: %s", (source) => {
    expect(() => parseLyrics(source, "lrc")).not.toThrow();
    const parsed = parseLyrics(source, "lrc");
    expect(parsed.sourceText).toBe(source);
    expect(parsed.lines.every((line) => line.sourceEnd >= line.sourceStart)).toBe(true);
  });
});
