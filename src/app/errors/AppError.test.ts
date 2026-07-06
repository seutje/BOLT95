import { describe, expect, it } from "vitest";
import { AppError, serializeAppError } from "./AppError";

describe("AppError", () => {
  it("serializes only stable, explicitly safe fields", () => {
    const error = new AppError("INPUT_INVALID", "The selected file is invalid.", {
      technicalDetail: "MIME signature mismatch",
      recoveryAction: "Choose an MP3 file.",
      cause: new Error("/private/path/song.mp3 contained secret lyrics"),
    });

    const serialized = serializeAppError(error);
    expect(serialized).toEqual({
      name: "AppError",
      code: "INPUT_INVALID",
      message: "The selected file is invalid.",
      technicalDetail: "MIME signature mismatch",
      recoveryAction: "Choose an MP3 file.",
    });
    expect(JSON.stringify(serialized)).not.toContain("private/path");
    expect(JSON.stringify(serialized)).not.toContain("secret lyrics");
  });
});
