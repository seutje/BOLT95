import Dexie, { type EntityTable } from "dexie";
import { AppError } from "../../app/errors/AppError";
import {
  editorProjectSchemaV1,
  projectFileSchemaV1,
  type EditorProject,
  type ProjectFileV1,
} from "../../domain/project/schema";

interface StoredProjectRecord extends EditorProject {
  readonly savedAt: number;
}

class ProjectDatabase extends Dexie {
  projects!: EntityTable<StoredProjectRecord, "id">;

  constructor() {
    super("bolt95-projects");
    this.version(1).stores({
      projects: "id, updatedAt, savedAt, title",
    });
  }
}

const database = new ProjectDatabase();

function ensureProjectStorage(): void {
  if (typeof indexedDB === "undefined") {
    throw new AppError("STORAGE_UNAVAILABLE", "Project storage is unavailable.", {
      technicalDetail: "indexedDB is undefined",
      recoveryAction: "Check browser storage permissions or export a project JSON file.",
    });
  }
}

export function hasProjectStorage(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function saveProject(project: EditorProject): Promise<void> {
  ensureProjectStorage();
  const parsed = editorProjectSchemaV1.parse(project);
  await database.transaction("rw", database.projects, async () => {
    await database.projects.put({ ...parsed, savedAt: Date.now() });
  });
}

export async function loadProject(projectId: string): Promise<EditorProject | null> {
  ensureProjectStorage();
  const record = await database.projects.get(projectId);
  return record ? editorProjectSchemaV1.parse(record) : null;
}

export async function listProjects(): Promise<readonly EditorProject[]> {
  ensureProjectStorage();
  const records = await database.projects.orderBy("updatedAt").reverse().toArray();
  return records.map((record) => editorProjectSchemaV1.parse(record));
}

export async function deleteProject(projectId: string): Promise<void> {
  ensureProjectStorage();
  await database.projects.delete(projectId);
}

export async function clearProjects(): Promise<void> {
  ensureProjectStorage();
  await database.projects.clear();
}

export function validateProjectFile(input: unknown): ProjectFileV1 {
  const version = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== 1) {
    throw new AppError("INPUT_INVALID", "This project file is not supported.", {
      technicalDetail: `schemaVersion=${String(version)}`,
      recoveryAction: "Open a project exported by this version of BOLT95.",
    });
  }
  return projectFileSchemaV1.parse(input);
}
