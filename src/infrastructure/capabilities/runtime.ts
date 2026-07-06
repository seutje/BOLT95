export interface SupportedVideoConfig {
  readonly id: "vp9-opus" | "vp8-opus" | "avc-aac" | "mediarecorder-webm";
  readonly label: string;
  readonly container: "webm" | "mp4";
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly supported: boolean;
  readonly detail: string;
}

export type RuntimeMode = "standard" | "compatibility" | "unsupported";

export interface RuntimeCapabilities {
  readonly webAssembly: boolean;
  readonly webWorkers: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly crossOriginIsolated: boolean;
  readonly wasmThreadsLikely: boolean;
  readonly offscreenCanvas: boolean;
  readonly transferableStreams: boolean;
  readonly webCodecs: boolean;
  readonly videoEncoder: boolean;
  readonly audioEncoder: boolean;
  readonly mediaRecorder: boolean;
  readonly indexedDb: boolean;
  readonly opfs: boolean;
  readonly serviceWorker: boolean;
  readonly fileSystemAccess: boolean;
  readonly deviceMemoryGb?: number;
  readonly hardwareConcurrency?: number;
  readonly supportedVideoConfigs: readonly SupportedVideoConfig[];
  readonly mode: RuntimeMode;
  readonly modeReason: string;
}

export interface CapabilityInputs {
  readonly webAssembly: boolean;
  readonly webWorkers: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly crossOriginIsolated: boolean;
  readonly indexedDb: boolean;
  readonly supportedVideoConfigs: readonly SupportedVideoConfig[];
}

export function classifyRuntimeMode(inputs: CapabilityInputs): {
  readonly mode: RuntimeMode;
  readonly reason: string;
} {
  if (!inputs.webAssembly || !inputs.webWorkers || !inputs.indexedDb) {
    const missing = [
      !inputs.webAssembly ? "WebAssembly" : undefined,
      !inputs.webWorkers ? "Web Workers" : undefined,
      !inputs.indexedDb ? "IndexedDB" : undefined,
    ].filter(Boolean);
    return {
      mode: "unsupported",
      reason: `Core local processing requires ${missing.join(", ")}.`,
    };
  }

  if (
    !inputs.supportedVideoConfigs.some(
      (configuration) =>
        configuration.supported &&
        (configuration.id === "vp9-opus" || configuration.id === "vp8-opus"),
    )
  ) {
    return {
      mode: "compatibility",
      reason: "Editing and subtitle export are available; native WebM video encoding is not.",
    };
  }

  return {
    mode: "standard",
    reason:
      inputs.crossOriginIsolated && inputs.sharedArrayBuffer
        ? "Core local processing and a native WebM export path are available."
        : "Single-thread local processing and a native WebM export path are available.",
  };
}

async function supportsVideo(config: VideoEncoderConfig): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

async function supportsAudio(config: AudioEncoderConfig): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    return (await AudioEncoder.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

async function probeVideoConfigurations(): Promise<SupportedVideoConfig[]> {
  const [vp9, vp8, avc, opus, aac] = await Promise.all([
    supportsVideo({
      codec: "vp09.00.30.08",
      width: 960,
      height: 540,
      bitrate: 2_000_000,
      framerate: 30,
    }),
    supportsVideo({
      codec: "vp8",
      width: 960,
      height: 540,
      bitrate: 2_000_000,
      framerate: 30,
    }),
    supportsVideo({
      codec: "avc1.42001f",
      width: 960,
      height: 540,
      bitrate: 2_000_000,
      framerate: 30,
    }),
    supportsAudio({
      codec: "opus",
      numberOfChannels: 1,
      sampleRate: 48_000,
      bitrate: 128_000,
    }),
    supportsAudio({
      codec: "mp4a.40.2",
      numberOfChannels: 1,
      sampleRate: 48_000,
      bitrate: 128_000,
    }),
  ]);

  const mediaRecorderWebm =
    typeof MediaRecorder !== "undefined" &&
    ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].some((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    );

  return [
    {
      id: "vp9-opus",
      label: "WebM — VP9 + Opus",
      container: "webm",
      videoCodec: "vp09.00.30.08",
      audioCodec: "opus",
      supported: vp9 && opus,
      detail: `video=${vp9}; audio=${opus}`,
    },
    {
      id: "vp8-opus",
      label: "WebM — VP8 + Opus",
      container: "webm",
      videoCodec: "vp8",
      audioCodec: "opus",
      supported: vp8 && opus,
      detail: `video=${vp8}; audio=${opus}`,
    },
    {
      id: "avc-aac",
      label: "MP4 candidate — AVC + AAC",
      container: "mp4",
      videoCodec: "avc1.42001f",
      audioCodec: "mp4a.40.2",
      supported: avc && aac,
      detail: `configuration only: video=${avc}; audio=${aac}; mux/playback unverified`,
    },
    {
      id: "mediarecorder-webm",
      label: "MediaRecorder WebM fallback",
      container: "webm",
      videoCodec: "browser-selected",
      audioCodec: "browser-selected",
      supported: mediaRecorderWebm,
      detail: "MIME support probe",
    },
  ];
}

export async function probeRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  const webAssembly = typeof WebAssembly !== "undefined";
  const webWorkers = typeof Worker !== "undefined";
  const sharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
  const crossOriginIsolated = globalThis.crossOriginIsolated === true;
  const indexedDb = typeof indexedDB !== "undefined";
  const supportedVideoConfigs = await probeVideoConfigurations();
  const classification = classifyRuntimeMode({
    webAssembly,
    webWorkers,
    sharedArrayBuffer,
    crossOriginIsolated,
    indexedDb,
    supportedVideoConfigs,
  });

  const result: RuntimeCapabilities = {
    webAssembly,
    webWorkers,
    sharedArrayBuffer,
    crossOriginIsolated,
    wasmThreadsLikely: crossOriginIsolated && sharedArrayBuffer,
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    transferableStreams:
      typeof ReadableStream !== "undefined" && typeof WritableStream !== "undefined",
    webCodecs: typeof VideoEncoder !== "undefined" || typeof AudioEncoder !== "undefined",
    videoEncoder: typeof VideoEncoder !== "undefined",
    audioEncoder: typeof AudioEncoder !== "undefined",
    mediaRecorder: typeof MediaRecorder !== "undefined",
    indexedDb,
    opfs: typeof navigator.storage?.getDirectory === "function",
    serviceWorker: "serviceWorker" in navigator,
    fileSystemAccess: "showOpenFilePicker" in globalThis,
    ...(navigator.deviceMemory ? { deviceMemoryGb: navigator.deviceMemory } : {}),
    ...(navigator.hardwareConcurrency
      ? { hardwareConcurrency: navigator.hardwareConcurrency }
      : {}),
    supportedVideoConfigs,
    mode: classification.mode,
    modeReason: classification.reason,
  };
  return Object.freeze(result);
}
