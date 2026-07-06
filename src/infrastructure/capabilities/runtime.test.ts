import { describe, expect, it } from "vitest";
import { classifyRuntimeMode, type CapabilityInputs, type SupportedVideoConfig } from "./runtime";

const webm: SupportedVideoConfig = {
  id: "vp9-opus",
  label: "WebM",
  container: "webm",
  videoCodec: "vp9",
  audioCodec: "opus",
  supported: true,
  detail: "test",
};

const baseline: CapabilityInputs = {
  webAssembly: true,
  webWorkers: true,
  sharedArrayBuffer: false,
  crossOriginIsolated: false,
  indexedDb: true,
  supportedVideoConfigs: [webm],
};

describe("classifyRuntimeMode", () => {
  it("selects standard mode without cross-origin isolation", () => {
    expect(classifyRuntimeMode(baseline)).toEqual({
      mode: "standard",
      reason: "Single-thread local processing and a native WebM export path are available.",
    });
  });

  it("keeps editing in compatibility mode without WebM", () => {
    expect(
      classifyRuntimeMode({
        ...baseline,
        supportedVideoConfigs: [{ ...webm, supported: false }],
      }).mode,
    ).toBe("compatibility");
  });

  it("rejects a browser missing a core local-processing primitive", () => {
    const result = classifyRuntimeMode({ ...baseline, webWorkers: false });
    expect(result.mode).toBe("unsupported");
    expect(result.reason).toContain("Web Workers");
  });
});
