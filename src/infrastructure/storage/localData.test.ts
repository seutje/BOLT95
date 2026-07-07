import { describe, expect, it, vi } from "vitest";
import { clearLocalData } from "./localData";
import { clearCachedModels } from "./models";
import { clearProjects } from "./projects";

vi.mock("./models", () => ({
  clearCachedModels: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./projects", () => ({
  clearProjects: vi.fn().mockResolvedValue(undefined),
}));

describe("local data clearing", () => {
  it("clears projects, cached models, and only BOLT95 shell caches", async () => {
    const originalCaches = globalThis.caches;
    const deleted: string[] = [];
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(["bolt95-shell-v1", "other-app"]),
        delete: vi.fn((name: string) => {
          deleted.push(name);
          return Promise.resolve(true);
        }),
      },
    });

    await expect(clearLocalData()).resolves.toEqual({
      projectsCleared: true,
      modelsCleared: true,
      cacheNamesDeleted: ["bolt95-shell-v1"],
    });
    expect(clearProjects).toHaveBeenCalledTimes(1);
    expect(clearCachedModels).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual(["bolt95-shell-v1"]);

    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: originalCaches,
    });
  });
});
