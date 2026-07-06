import { describe, expect, it } from "vitest";
import type { BuildInfo } from "../../app/buildInfo";
import type { RuntimeCapabilities } from "../capabilities/runtime";
import { createSafeDiagnostics } from "./diagnostics";

const build: BuildInfo = {
  appVersion: "1.0.0",
  commitHash: "abc",
  projectSchemaVersion: 1,
  alignmentEngineVersion: "1",
  whisperAdapterVersion: "1",
  rendererVersion: "1",
  mediabunnyVersion: "1",
};

const capabilities = {
  mode: "standard",
  crossOriginIsolated: false,
  sharedArrayBuffer: false,
  webCodecs: true,
  mediaRecorder: true,
  indexedDb: true,
} as RuntimeCapabilities;

describe("safe diagnostics", () => {
  it("contains only approved build and capability fields", () => {
    const diagnostics = createSafeDiagnostics(build, capabilities, "test browser");
    expect(diagnostics).toMatchObject({
      appVersion: "1.0.0",
      browser: "test browser",
      capabilityMode: "standard",
    });
    expect(Object.keys(diagnostics)).not.toContain("lyrics");
    expect(Object.keys(diagnostics)).not.toContain("fileName");
    expect(Object.keys(diagnostics)).not.toContain("projectTitle");
  });
});
