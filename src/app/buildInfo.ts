export interface BuildInfo {
  readonly appVersion: string;
  readonly commitHash: string;
  readonly projectSchemaVersion: number;
  readonly alignmentEngineVersion: string;
  readonly whisperAdapterVersion: string;
  readonly rendererVersion: string;
  readonly mediabunnyVersion: string;
}

export const buildInfo: BuildInfo = Object.freeze({
  appVersion: __APP_VERSION__,
  commitHash: __COMMIT_HASH__,
  projectSchemaVersion: __PROJECT_SCHEMA_VERSION__,
  alignmentEngineVersion: __ALIGNMENT_ENGINE_VERSION__,
  whisperAdapterVersion: __WHISPER_ADAPTER_VERSION__,
  rendererVersion: __RENDERER_VERSION__,
  mediabunnyVersion: __MEDIABUNNY_VERSION__,
});
