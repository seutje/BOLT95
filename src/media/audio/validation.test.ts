import { describe, expect, it } from "vitest";
import { AppError } from "../../app/errors/AppError";
import { estimateProcessingRisk, validateAudioFile, validateDecodedDuration } from "./validation";

const mp3Header = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);

describe("audio input validation", () => {
  it("accepts an MP3 based on MIME, extension, and bytes", async () => {
    await expect(
      validateAudioFile(new File([mp3Header], "track.mp3", { type: "audio/mpeg" })),
    ).resolves.toBeUndefined();
  });

  it.each([
    [new File([], "empty.mp3", { type: "audio/mpeg" }), "empty"],
    [new File([mp3Header], "track.wav", { type: "audio/wav" }), "extension"],
    [new File([new Uint8Array(20)], "fake.mp3", { type: "audio/mpeg" }), "header"],
  ])("rejects invalid input: %s", async (file) => {
    await expect(validateAudioFile(file)).rejects.toBeInstanceOf(AppError);
  });

  it("classifies configurable size and duration risk", () => {
    expect(estimateProcessingRisk(1, 1).risk).toBe("low");
    expect(estimateProcessingRisk(26 * 1024 * 1024, 1).risk).toBe("moderate");
    expect(estimateProcessingRisk(1, 26 * 60_000).risk).toBe("high");
    expect(() => validateDecodedDuration(91 * 60_000)).toThrow(AppError);
  });

  it("enforces a configured maximum size independently of the file name", async () => {
    const limits = {
      moderateBytes: 4,
      highBytes: 6,
      maximumBytes: 8,
      moderateDurationMs: 1000,
      highDurationMs: 2000,
      maximumDurationMs: 3000,
    };
    await expect(
      validateAudioFile(new File([mp3Header], "track.mp3", { type: "audio/mpeg" }), limits),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
  });
});
