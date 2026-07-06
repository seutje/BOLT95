import { act, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeCapabilities } from "../infrastructure/capabilities/runtime";

const capabilities: RuntimeCapabilities = {
  webAssembly: true,
  webWorkers: true,
  sharedArrayBuffer: false,
  crossOriginIsolated: false,
  wasmThreadsLikely: false,
  offscreenCanvas: true,
  transferableStreams: true,
  webCodecs: true,
  videoEncoder: true,
  audioEncoder: true,
  mediaRecorder: true,
  indexedDb: true,
  opfs: false,
  serviceWorker: true,
  fileSystemAccess: false,
  supportedVideoConfigs: [
    {
      id: "vp9-opus",
      label: "WebM — VP9 + Opus",
      container: "webm",
      videoCodec: "vp9",
      audioCodec: "opus",
      supported: true,
      detail: "test",
    },
  ],
  mode: "standard",
  modeReason: "Single-thread local processing and a native WebM export path are available.",
};

vi.mock("../infrastructure/capabilities/runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("../infrastructure/capabilities/runtime")>();
  return {
    ...original,
    probeRuntimeCapabilities: vi.fn(async () => capabilities),
  };
});

import { App } from "./App";
import { useAppStore } from "./state/store";

describe("App shell", () => {
  beforeEach(() => {
    useAppStore.setState({ activeStage: "import", openDialog: null, currentJob: null });
  });

  it("shows local-processing privacy and guarded stages", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Add audio and lyrics" })).toBeVisible();
    expect(screen.getByText("Your media stays on this device.")).toBeVisible();
    expect(screen.getByRole("button", { name: /2\. Transcribe/u })).toBeDisabled();
    expect(await screen.findByText("Standard mode")).toBeVisible();
  });

  it("opens and closes capability details with semantic controls", async () => {
    render(<App />);
    await screen.findByText("Standard mode");
    await act(async () => screen.getByRole("button", { name: "Details…" }).click());
    expect(screen.getByRole("dialog", { name: "Runtime capabilities" })).toBeVisible();
    await act(async () => screen.getByRole("button", { name: "OK" }).click());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no automatically detectable accessibility violations", async () => {
    const { container } = render(<App />);
    await screen.findByText("Standard mode");
    const report = await axe.run(container);
    expect(report.violations).toEqual([]);
  });
});
