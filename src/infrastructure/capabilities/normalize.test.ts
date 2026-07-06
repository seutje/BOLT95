import { describe, expect, it } from "vitest";
import {
  normalizeCapabilityMode,
  type ProofCapabilities,
} from "./normalize";

const baseline: ProofCapabilities = {
  crossOriginIsolated: false,
  sharedArrayBuffer: false,
  webCodecs: true,
  videoEncoder: true,
  audioEncoder: true,
  mediaRecorder: true,
  codecs: [{ id: "vp9-opus", supported: true }],
};

describe("normalizeCapabilityMode", () => {
  it("keeps non-isolated browsers in standard mode when codecs work", () => {
    expect(normalizeCapabilityMode(baseline)).toBe("standard");
  });

  it("uses compatibility mode when WebCodecs audio is unavailable", () => {
    expect(
      normalizeCapabilityMode({ ...baseline, audioEncoder: false }),
    ).toBe("compatibility");
  });

  it("is unsupported without either encoding API", () => {
    expect(
      normalizeCapabilityMode({
        ...baseline,
        webCodecs: false,
        mediaRecorder: false,
      }),
    ).toBe("unsupported");
  });
});
