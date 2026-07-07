import { describe, expect, it } from "vitest";
import { validateProjectFile } from "../../infrastructure/storage/projects";

const MALFORMED_PROJECTS = [
  null,
  undefined,
  {},
  { schemaVersion: 0 },
  { schemaVersion: 1, project: null },
  { schemaVersion: 1, exportedAt: -1, appVersion: "x", project: {} },
  { schemaVersion: 1, exportedAt: 0, appVersion: "x", project: { title: "../secret.mp3" } },
] as const;

describe("project file boundary validation", () => {
  it.each(MALFORMED_PROJECTS)("rejects malformed project input %#", (input) => {
    expect(() => validateProjectFile(input)).toThrow();
  });
});
