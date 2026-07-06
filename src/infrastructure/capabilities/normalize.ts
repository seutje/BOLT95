export interface CodecProbe {
  readonly id: string;
  readonly supported: boolean;
  readonly detail?: string;
}

export interface ProofCapabilities {
  readonly crossOriginIsolated: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly webCodecs: boolean;
  readonly videoEncoder: boolean;
  readonly audioEncoder: boolean;
  readonly mediaRecorder: boolean;
  readonly codecs: readonly CodecProbe[];
}

export type CapabilityMode = "standard" | "compatibility" | "unsupported";

export function normalizeCapabilityMode(capabilities: ProofCapabilities): CapabilityMode {
  if (!capabilities.webCodecs && !capabilities.mediaRecorder) {
    return "unsupported";
  }

  if (
    !capabilities.webCodecs ||
    !capabilities.videoEncoder ||
    !capabilities.audioEncoder ||
    capabilities.codecs.every((codec) => !codec.supported)
  ) {
    return "compatibility";
  }

  return "standard";
}
