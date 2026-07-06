import { describe, expect, it } from "vitest";
import { projectInputSchema } from "./schema";

describe("project input boundary", () => {
  it("accepts valid imported audio and structured lyrics", () => {
    const result = projectInputSchema.safeParse({
      schemaVersion: 1,
      audio: {
        durationMs: 1000,
        sampleRate: 16_000,
        sampleCount: 16_000,
        fingerprint: "a".repeat(64),
        format: "MP3",
        fileSize: 100,
      },
      lyrics: { format: "txt", sourceText: "Line", metadata: [], lines: [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed fingerprints and non-positive durations", () => {
    expect(
      projectInputSchema.safeParse({
        schemaVersion: 1,
        audio: {
          durationMs: 0,
          sampleRate: 16_000,
          sampleCount: 1,
          fingerprint: "unsafe",
          format: "MP3",
          fileSize: 1,
        },
      }).success,
    ).toBe(false);
  });
});
