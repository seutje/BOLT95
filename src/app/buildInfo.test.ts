import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__APP_VERSION__", "1.2.3");
vi.stubGlobal("__COMMIT_HASH__", "abc123");
vi.stubGlobal("__PROJECT_SCHEMA_VERSION__", 1);
vi.stubGlobal("__ALIGNMENT_ENGINE_VERSION__", "2.0.0");
vi.stubGlobal("__WHISPER_ADAPTER_VERSION__", "3.0.0");
vi.stubGlobal("__RENDERER_VERSION__", "4.0.0");
vi.stubGlobal("__MEDIABUNNY_VERSION__", "5.0.0");

describe("buildInfo", () => {
  it("exposes all reproducibility versions", async () => {
    const { buildInfo } = await import("./buildInfo");
    expect(buildInfo).toEqual({
      appVersion: "1.2.3",
      commitHash: "abc123",
      projectSchemaVersion: 1,
      alignmentEngineVersion: "2.0.0",
      whisperAdapterVersion: "3.0.0",
      rendererVersion: "4.0.0",
      mediabunnyVersion: "5.0.0",
    });
    expect(Object.isFrozen(buildInfo)).toBe(true);
  });
});
