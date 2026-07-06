import { describe, expect, it } from "vitest";
import { computeWaveform } from "./waveform";

describe("waveform analysis", () => {
  it("computes compact min, max, and RMS buckets", () => {
    const waveform = computeWaveform(new Float32Array([-1, 1, -0.5, 0.5]), 4, 2);
    expect(waveform.durationMs).toBe(1000);
    expect([...waveform.min]).toEqual([-1, -0.5]);
    expect([...waveform.max]).toEqual([1, 0.5]);
    expect([...waveform.rms]).toEqual([1, 0.5]);
  });
});
