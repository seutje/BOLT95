import type { BuildInfo } from "../../app/buildInfo";
import type { RuntimeCapabilities } from "../capabilities/runtime";

export interface SafeDiagnostics {
  readonly appVersion: string;
  readonly commitHash: string;
  readonly projectSchemaVersion: number;
  readonly rendererVersion: string;
  readonly browser: string;
  readonly capabilityMode: string;
  readonly crossOriginIsolated: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly webCodecs: boolean;
  readonly mediaRecorder: boolean;
  readonly indexedDb: boolean;
}

export function createSafeDiagnostics(
  build: BuildInfo,
  capabilities: RuntimeCapabilities,
  browser: string,
): SafeDiagnostics {
  return {
    appVersion: build.appVersion,
    commitHash: build.commitHash,
    projectSchemaVersion: build.projectSchemaVersion,
    rendererVersion: build.rendererVersion,
    browser,
    capabilityMode: capabilities.mode,
    crossOriginIsolated: capabilities.crossOriginIsolated,
    sharedArrayBuffer: capabilities.sharedArrayBuffer,
    webCodecs: capabilities.webCodecs,
    mediaRecorder: capabilities.mediaRecorder,
    indexedDb: capabilities.indexedDb,
  };
}
