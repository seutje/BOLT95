import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

interface PackageManifest {
  readonly version: string;
  readonly dependencies: Record<string, string>;
}

const packageManifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "package.json"), "utf8"),
) as PackageManifest;

function commitHash(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "development";
  }
}

function runtimeModelManifest(): Plugin {
  return {
    name: "bolt95-runtime-model-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "config/models.json",
        source: readFileSync(resolve(import.meta.dirname, "config/models.json"), "utf8"),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? (mode === "subpath" ? "/BOLT95/" : "/"),
  plugins: [react(), runtimeModelManifest()],
  define: {
    __APP_VERSION__: JSON.stringify(packageManifest.version),
    __COMMIT_HASH__: JSON.stringify(commitHash()),
    __PROJECT_SCHEMA_VERSION__: "1",
    __ALIGNMENT_ENGINE_VERSION__: JSON.stringify("0.1.0"),
    __WHISPER_ADAPTER_VERSION__: JSON.stringify("0.1.0"),
    __RENDERER_VERSION__: JSON.stringify("0.1.0"),
    __MEDIABUNNY_VERSION__: JSON.stringify(packageManifest.dependencies.mediabunny ?? "unknown"),
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        "spikes/whisper/index": resolve(import.meta.dirname, "spikes/whisper/index.html"),
        "spikes/video-export/index": resolve(import.meta.dirname, "spikes/video-export/index.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "spikes/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    environmentMatchGlobs: [["src/domain/**/*.test.ts", "node"]],
  },
}));
