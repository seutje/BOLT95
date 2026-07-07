import { describe, expect, it } from "vitest";
import { selectableModels, selectModelForTranscription } from "./registry";

describe("transcription model registry", () => {
  it("filters selectable models by language mode", () => {
    expect(selectableModels("multilingual").map((model) => model.id)).toEqual([
      "tiny-multilingual-q5_1",
      "base-multilingual-q5_1",
    ]);
    expect(selectableModels("en").map((model) => model.id)).toEqual([
      "tiny-multilingual-q5_1",
      "base-multilingual-q5_1",
      "base-english-q5_1",
    ]);
  });

  it("prefers the small registered model for high-risk audio", () => {
    const choice = selectModelForTranscription({
      languageMode: "auto",
      audioRisk: "high",
    });
    expect(choice.model.id).toBe("tiny-multilingual-q5_1");
    expect(choice.reason).toMatch(/High-risk/u);
  });

  it("honors an explicit compatible model choice", () => {
    const choice = selectModelForTranscription({
      languageMode: "auto",
      audioRisk: "low",
      requestedModelId: "base-multilingual-q5_1",
    });
    expect(choice.model.id).toBe("base-multilingual-q5_1");
    expect(choice.reason).toBe("Selected by user.");
  });

  it("uses the English-only base model for English by default when risk allows", () => {
    const choice = selectModelForTranscription({
      languageMode: "en",
      audioRisk: "low",
    });
    expect(choice.model.id).toBe("base-english-q5_1");
  });
});
