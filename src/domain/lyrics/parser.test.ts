import { describe, expect, it } from "vitest";
import { parseLyrics } from "./parser";

describe("lyrics parser", () => {
  it("preserves Unicode, exact source text, blank lines, stanzas, and annotations", () => {
    const source = "[Verse 1]\nHéllo, 世界 👋\n\nDon’t erase blank lines.\n";
    const parsed = parseLyrics(source, "txt");
    expect(parsed.sourceText).toBe(source);
    expect(parsed.lines.map((line) => line.text)).toEqual([
      "[Verse 1]",
      "Héllo, 世界 👋",
      "",
      "Don’t erase blank lines.",
    ]);
    expect(parsed.lines[0]?.annotation).toBe("Verse 1");
    expect(parsed.lines[3]?.stanza).toBe(1);
  });

  it("extracts LRC metadata and multiple timestamps without changing lyric text", () => {
    const parsed = parseLyrics("[ar:Artist]\n[00:01.20][00:02.345]Line\n\n[Chorus]", "lrc");
    expect(parsed.metadata).toEqual([{ key: "ar", value: "Artist" }]);
    expect(parsed.lines[0]?.text).toBe("Line");
    expect(parsed.lines[0]?.timestamps.map((timestamp) => timestamp.milliseconds)).toEqual([
      1200, 2345,
    ]);
    expect(parsed.lines[1]?.blank).toBe(true);
    expect(parsed.lines[2]?.annotation).toBe("Chorus");
  });
});
