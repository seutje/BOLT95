import { describe, expect, it } from "vitest";
import { availableWorkflowStages, canEnterWorkflowStage, nextWorkflowStage } from "./workflow";

describe("workflow commands", () => {
  it("guards stages until their inputs exist", () => {
    expect(
      availableWorkflowStages({ hasAudio: false, hasTranscript: false, hasAlignment: false }),
    ).toEqual(["import"]);
    expect(
      canEnterWorkflowStage("transcribe", {
        hasAudio: false,
        hasTranscript: false,
        hasAlignment: false,
      }),
    ).toBe(false);
    expect(
      availableWorkflowStages({ hasAudio: true, hasTranscript: true, hasAlignment: true }),
    ).toEqual(["import", "transcribe", "align", "review"]);
  });

  it("advances only to the next completed boundary", () => {
    expect(
      nextWorkflowStage("import", { hasAudio: true, hasTranscript: false, hasAlignment: false }),
    ).toBe("transcribe");
    expect(
      nextWorkflowStage("transcribe", { hasAudio: true, hasTranscript: true, hasAlignment: false }),
    ).toBe("align");
    expect(
      nextWorkflowStage("align", { hasAudio: true, hasTranscript: true, hasAlignment: true }),
    ).toBe("review");
  });
});
