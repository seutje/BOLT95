import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "subpath" ? "/BOLT95/" : "/",
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        "spikes/whisper/index": resolve(import.meta.dirname, "spikes/whisper/index.html"),
        "spikes/video-export/index": resolve(
          import.meta.dirname,
          "spikes/video-export/index.html",
        ),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "spikes/**/*.test.ts"],
  },
}));
