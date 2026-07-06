import { describe, expect, it } from "vitest";
import { downmixChannels, resampleWindowedSinc } from "./resample";

function sine(rate: number, frequency: number, seconds: number): Float32Array {
  return Float32Array.from({ length: rate * seconds }, (_, index) =>
    Math.sin((2 * Math.PI * frequency * index) / rate),
  );
}

describe("audio resampling", () => {
  it("resamples deterministically to the expected duration and keeps finite samples", () => {
    const input = sine(48_000, 440, 2);
    const first = resampleWindowedSinc(input, 48_000, 16_000);
    const second = resampleWindowedSinc(input, 48_000, 16_000);
    expect(first).toEqual(second);
    expect(first).toHaveLength(32_000);
    expect(first.every(Number.isFinite)).toBe(true);

    let crossings = 0;
    for (let index = 1; index < first.length; index += 1) {
      if ((first[index - 1] ?? 0) <= 0 && (first[index] ?? 0) > 0) crossings += 1;
    }
    expect(Math.abs(crossings / 2 - 440)).toBeLessThanOrEqual(1);
  });

  it("downmixes stereo by averaging and clamps samples", () => {
    expect(downmixChannels([new Float32Array([1, 0.5]), new Float32Array([-1, 1])])).toEqual(
      new Float32Array([0, 0.75]),
    );
  });
});
