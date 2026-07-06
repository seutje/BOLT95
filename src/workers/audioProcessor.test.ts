import { describe, expect, it } from "vitest";
import { processAudioRequest } from "./audioProcessor";

describe("audio worker processor", () => {
  it("returns transferable finite PCM, fingerprint, waveform, and progress", async () => {
    const left = new Float32Array(4800).map((_, index) => Math.sin(index / 10));
    const right = new Float32Array(4800).map((_, index) => Math.cos(index / 10));
    const progress: number[] = [];
    const response = await processAudioRequest(
      {
        type: "audio/process",
        jobId: "fixture",
        sourceRate: 48_000,
        channels: [left.buffer as ArrayBuffer, right.buffer as ArrayBuffer],
        sourceBytes: new Uint8Array([1, 2, 3]).buffer,
      },
      (value) => progress.push(value),
    );
    const pcm = new Float32Array(response.pcm);
    expect(pcm).toHaveLength(1600);
    expect(pcm.every(Number.isFinite)).toBe(true);
    expect(response.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(new Float32Array(response.waveform.max).length).toBeGreaterThan(0);
    expect(progress).toEqual([0.1, 0.3, 0.72, 1]);
  });
});
