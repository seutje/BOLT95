import { describe, expect, it } from "vitest";
import { restoreWaveform } from "./protocol";

describe("worker protocol boundary inputs", () => {
  it("restores empty waveform buffers without producing non-finite values", () => {
    const waveform = restoreWaveform({
      durationMs: 0,
      samplesPerSecond: 100,
      min: new ArrayBuffer(0),
      max: new ArrayBuffer(0),
      rms: new ArrayBuffer(0),
    });

    expect(waveform.min).toHaveLength(0);
    expect(waveform.max).toHaveLength(0);
    expect(waveform.rms).toHaveLength(0);
  });
});
