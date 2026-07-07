import { describe, expect, it } from "vitest";
import { rawWhisperToTranscript } from "./words";

describe("Whisper transcript mapping", () => {
  it("maps raw timed tokens into monotonic transcript words with raw evidence", () => {
    const result = rawWhisperToTranscript({
      durationMs: 3000,
      modelId: "tiny",
      raw: {
        languageId: 0,
        segments: [
          {
            text: " Hello world",
            startMs: 0,
            endMs: 1200,
            tokens: [
              { text: " Hello", startMs: 0, endMs: 500, probability: 0.9 },
              { text: " world", startMs: 500, endMs: 1100, probability: 0.8 },
            ],
          },
        ],
        wasmHeapBytes: 1024,
        peakPcmBytes: 512,
      },
    });

    expect(result.language).toBe("en");
    expect(result.modelId).toBe("tiny");
    expect(result.words).toEqual([
      {
        id: "w-0-0",
        text: "Hello",
        normalized: ["hello"],
        startMs: 0,
        endMs: 500,
        confidence: 0.9,
      },
      {
        id: "w-0-1",
        text: "world",
        normalized: ["world"],
        startMs: 500,
        endMs: 1100,
        confidence: 0.8,
      },
    ]);
    expect(result.raw.segments[0]?.tokens).toHaveLength(2);
  });

  it("uses segment timing as fallback for untimed token evidence", () => {
    const result = rawWhisperToTranscript({
      durationMs: 1000,
      modelId: "tiny",
      raw: {
        languageId: 0,
        segments: [
          {
            text: "one two",
            startMs: 100,
            endMs: 500,
            tokens: [
              { text: "one", startMs: null, endMs: null, probability: 0.4 },
              { text: "two", startMs: null, endMs: null, probability: 0.4 },
            ],
          },
        ],
        wasmHeapBytes: 1024,
        peakPcmBytes: 512,
      },
    });

    expect(result.words.map((word) => [word.startMs, word.endMs])).toEqual([
      [100, 300],
      [300, 500],
    ]);
  });
});
