import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorProject } from "../../domain/project/schema";
import { defaultVisualTheme } from "../../domain/rendering/schema";
import type { AudioImportResult } from "../audio/types";
import {
  draftDurationMs,
  draftExportPresets,
  draftPresetForProject,
  estimateDraftExportRisk,
  exportDurationMs,
  fullExportPresets,
  probeMediaRecorderBackend,
  probeDraftVideoBackend,
  videoPresetForProject,
} from "./backend";

vi.mock("mediabunny", () => ({
  canEncodeAudio: vi.fn(),
  canEncodeVideo: vi.fn(),
}));

const { canEncodeAudio, canEncodeVideo } = await import("mediabunny");
const mockedCanEncodeAudio = vi.mocked(canEncodeAudio);
const mockedCanEncodeVideo = vi.mocked(canEncodeVideo);

function audio(durationMs = 8_000): AudioImportResult {
  return {
    file: new File(["audio"], "fixture.mp3", { type: "audio/mpeg" }),
    objectUrl: "blob:fixture",
    format: "MP3",
    durationMs,
    sampleRate: 16_000,
    sampleCount: Math.round((durationMs / 1_000) * 16_000),
    fingerprint: "a".repeat(64),
    waveform: {
      durationMs,
      samplesPerSecond: 100,
      min: new Float32Array(1),
      max: new Float32Array(1),
      rms: new Float32Array(1),
    },
    pcm: new Float32Array(Math.round((durationMs / 1_000) * 16_000)),
    risk: "low",
    riskReasons: [],
  };
}

const project: EditorProject = {
  schemaVersion: 1,
  id: "project",
  title: "fixture",
  createdAt: 0,
  updatedAt: 0,
  audio: {
    durationMs: 8_000,
    fingerprint: "a".repeat(64),
    fileName: "fixture.mp3",
    fileSize: 1234,
    format: "MP3" as const,
  },
  alignment: {
    schemaVersion: 1,
    engineVersion: "test",
    canonical: {
      schemaVersion: 1,
      format: "txt",
      sourceText: "",
      metadata: [],
      lines: [],
      tokens: [],
    },
    transcript: { schemaVersion: 1, language: "en", durationMs: 8_000, words: [] },
    words: [],
    lines: [],
    issues: [],
    benchmark: {
      canonicalWords: 0,
      transcriptWords: 0,
      cells: 0,
      elapsedMs: 0,
      hierarchicalAlignmentTriggered: false,
    },
  },
  lines: [
    {
      id: "l1",
      text: "First",
      startMs: 0,
      endMs: 2_000,
      provenance: "manual" as const,
      reviewState: "accepted" as const,
    },
    {
      id: "l2",
      text: "Last",
      startMs: 2_000,
      endMs: 8_000,
      provenance: "manual" as const,
      reviewState: "accepted" as const,
    },
  ],
  visual: defaultVisualTheme,
};

describe("draft video backend", () => {
  beforeEach(() => {
    vi.stubGlobal("VideoEncoder", class VideoEncoder {});
    vi.stubGlobal("AudioEncoder", class AudioEncoder {});
    vi.stubGlobal("HTMLCanvasElement", class HTMLCanvasElement {});
    mockedCanEncodeAudio.mockResolvedValue(true);
    mockedCanEncodeVideo.mockImplementation(async (codec) => codec === "vp8");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("selects a verified WebM codec combination with VP8 fallback", async () => {
    const backend = await probeDraftVideoBackend(draftExportPresets[0]);
    expect(backend.supported).toBe(true);
    expect(backend.videoCodec).toBe("vp8");
    expect(backend.audioCodec).toBe("opus");
    expect(backend.mimeType).toContain("vp8");
  });

  it("disables video export when required APIs are absent", async () => {
    vi.stubGlobal("VideoEncoder", undefined);
    const backend = await probeDraftVideoBackend(draftExportPresets[0]);
    expect(backend.supported).toBe(false);
    expect(backend.detail).toMatch(/WebCodecs/u);
  });

  it("caps draft duration to five seconds and keeps project preset draft-only", () => {
    expect(draftDurationMs(project, audio())).toBe(5_000);
    expect(draftPresetForProject(project).id).toBe("landscape-draft");
  });

  it("uses audio duration instead of the final lyric timestamp for video export", () => {
    const shortLyricsProject: EditorProject = {
      ...project,
      lines: project.lines.map((line) => ({ ...line, endMs: Math.min(line.endMs, 3_000) })),
    };
    const fullPreset = videoPresetForProject(shortLyricsProject, "landscape-full");
    expect(exportDurationMs(shortLyricsProject, audio(8_000), fullPreset)).toBe(8_000);
    expect(exportDurationMs(shortLyricsProject, audio(8_000), draftExportPresets[2]!)).toBe(5_000);
  });

  it("reports risk from support, duration, and memory facts", () => {
    const risk = estimateDraftExportRisk(draftExportPresets[2]!, audio(), null, 2);
    expect(risk.level).toBe("high");
    expect(risk.blockers.join(" ")).toContain("supported video backend");
    expect(risk.reasons.join(" ")).toContain("5 seconds");
  });

  it("qualifies full presets with benchmark duration and memory gates", () => {
    const backend = {
      id: "webcodecs-webm" as const,
      label: "WebM",
      container: "webm" as const,
      videoCodec: "vp9" as const,
      audioCodec: "opus" as const,
      mimeType: "video/webm",
      supported: true,
      detail: "ok",
      deterministic: true,
    };
    const square = fullExportPresets.find((preset) => preset.id === "square-full")!;
    const qualified = estimateDraftExportRisk(square, audio(20_000), backend, 8);
    expect(qualified.qualified).toBe(true);
    expect(qualified.reasons.join(" ")).toContain("complete project duration");

    const blocked = estimateDraftExportRisk(square, audio(20_000), backend, 2);
    expect(blocked.qualified).toBe(false);
    expect(blocked.blockers.join(" ")).toContain("Device memory");
  });

  it("probes the MediaRecorder fallback by supported MIME type", () => {
    class FakeCanvas {
      captureStream() {
        return {};
      }
    }
    class FakeMediaRecorder {
      static isTypeSupported(type: string) {
        return type === "video/webm;codecs=vp8";
      }
    }
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    const backend = probeMediaRecorderBackend();
    expect(backend.supported).toBe(true);
    expect(backend.id).toBe("mediarecorder-webm");
    expect(backend.mimeType).toBe("video/webm;codecs=vp8");
    expect(backend.deterministic).toBe(false);
  });
});
