import { describe, expect, it } from "vitest";
import {
  createCanonicalLyrics,
  normalizeLyricToken,
  reconstructCanonicalSource,
} from "./canonical";
import { parseLyrics } from "./parser";

describe("canonical lyrics", () => {
  it("preserves exact source text while retaining offsets and whitespace", () => {
    const source = "  Don’t stop at 2  \n\n[Chorus]\nCafé déjà vu\n";
    const canonical = createCanonicalLyrics(parseLyrics(source, "txt"));
    expect(reconstructCanonicalSource(canonical)).toBe(source);
    expect(canonical.lines[0]?.leadingWhitespace).toBe("  ");
    expect(canonical.lines[0]?.trailingWhitespace).toBe("  ");
    expect(canonical.lines[2]?.annotation).toBe("Chorus");
    expect(
      canonical.tokens.every((token) => source.slice(token.sourceStart, token.sourceEnd)),
    ).toBe(true);
  });

  it("normalizes contractions, numbers, punctuation, dashes, apostrophes, and accents", () => {
    expect(normalizeLyricToken("Don’t")).toEqual(["do", "not"]);
    expect(normalizeLyricToken("2")).toEqual(["two"]);
    expect(normalizeLyricToken("Café")).toEqual(["cafe"]);
    expect(normalizeLyricToken("high-wire")).toEqual(["highwire"]);
    expect(normalizeLyricToken("LOUD!")).toEqual(["loud"]);
  });

  it("classifies vocalizations without deleting canonical text", () => {
    const canonical = createCanonicalLyrics(parseLyrics("Oh oh\nLa la\n", "txt"));
    expect(canonical.tokens.map((token) => token.kind)).toEqual([
      "vocalization",
      "vocalization",
      "vocalization",
      "vocalization",
    ]);
    expect(reconstructCanonicalSource(canonical)).toBe("Oh oh\nLa la\n");
  });
});
