import { describe, expect, it } from "vitest";
import { resolveAssetUrl } from "./urls";

describe("resolveAssetUrl", () => {
  it("resolves root-hosted assets", () => {
    expect(resolveAssetUrl("models/tiny.bin", "/", "https://x.github.io")).toBe(
      "https://x.github.io/models/tiny.bin",
    );
  });

  it("retains a GitHub repository base path", () => {
    expect(resolveAssetUrl("/wasm/whisper.wasm", "/BOLT95/", "https://x.github.io")).toBe(
      "https://x.github.io/BOLT95/wasm/whisper.wasm",
    );
  });

  it("normalizes a base path without a trailing slash", () => {
    expect(resolveAssetUrl("icons/app.svg", "custom", "https://example.test")).toBe(
      "https://example.test/custom/icons/app.svg",
    );
  });
});
