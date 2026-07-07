import { describe, expect, it } from "vitest";
import manifest from "../../../config/models.json";
import { modelManifestSchema } from "./manifest";

describe("model manifest", () => {
  it("contains immutable, validated model descriptors", () => {
    const parsed = modelManifestSchema.parse(manifest);
    expect(parsed.models.map((model) => model.id)).toEqual([
      "tiny-multilingual-q5_1",
      "base-multilingual-q5_1",
      "base-english-q5_1",
    ]);
  });

  it("rejects a URL that can move independently of the manifest revision", () => {
    expect(() =>
      modelManifestSchema.parse({
        ...manifest,
        models: [
          {
            ...manifest.models[0],
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
          },
        ],
      }),
    ).toThrow(/not pinned/u);
  });
});
