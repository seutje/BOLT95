import { describe, expect, it } from "vitest";
import { cacheSizeBytes, verifyModelBlob } from "./models";

describe("model storage helpers", () => {
  it("sums cached model sizes without reading blobs", () => {
    expect(
      cacheSizeBytes([
        {
          id: "tiny",
          displayName: "Tiny",
          sizeBytes: 10,
          sha256: "a".repeat(64),
          storedAt: 1,
          suppliedByUser: false,
        },
        {
          id: "base",
          displayName: "Base",
          sizeBytes: 15,
          sha256: "b".repeat(64),
          storedAt: 2,
          suppliedByUser: true,
        },
      ]),
    ).toBe(25);
  });

  it("rejects a model blob with the wrong size before inference", async () => {
    await expect(
      verifyModelBlob(new Blob(["abc"]), {
        displayName: "Tiny",
        sizeBytes: 4,
        sha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({
      code: "INPUT_INVALID",
      message: "Model file size does not match the registry.",
    });
  });

  it("rejects a model blob with the wrong SHA-256", async () => {
    await expect(
      verifyModelBlob(new Blob(["abc"]), {
        displayName: "Tiny",
        sizeBytes: 3,
        sha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({
      code: "INPUT_INVALID",
      message: "Model integrity check failed.",
    });
  });
});
