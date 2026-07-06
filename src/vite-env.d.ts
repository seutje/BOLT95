/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;
declare const __PROJECT_SCHEMA_VERSION__: number;
declare const __ALIGNMENT_ENGINE_VERSION__: string;
declare const __WHISPER_ADAPTER_VERSION__: string;
declare const __RENDERER_VERSION__: string;
declare const __MEDIABUNNY_VERSION__: string;

interface Navigator {
  readonly deviceMemory?: number;
}
