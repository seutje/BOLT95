import Dexie, { type EntityTable } from "dexie";
import { AppError } from "../../app/errors/AppError";
import {
  editorProjectSchemaV1,
  projectFileSchemaV1,
  type EditorProject,
  type ProjectFileV1,
} from "../../domain/project/schema";
import type { VisualTheme } from "../../domain/rendering/schema";

interface StoredProjectRecord extends EditorProject {
  readonly savedAt: number;
}

interface StoredProjectBackgroundRecord {
  readonly id: string;
  readonly projectId: string;
  readonly fingerprint: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly blob: Blob;
  readonly savedAt: number;
}

class ProjectDatabase extends Dexie {
  projects!: EntityTable<StoredProjectRecord, "id">;
  projectBackgrounds!: EntityTable<StoredProjectBackgroundRecord, "id">;

  constructor() {
    super("bolt95-projects");
    this.version(1).stores({
      projects: "id, updatedAt, savedAt, title",
    });
    this.version(2).stores({
      projects: "id, updatedAt, savedAt, title",
      projectBackgrounds: "id, projectId, fingerprint, savedAt",
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
  await database.transaction("rw", database.projects, database.projectBackgrounds, async () => {
    await database.projects.delete(projectId);
    await database.projectBackgrounds.where("projectId").equals(projectId).delete();
  });
}

export async function clearProjects(): Promise<void> {
  ensureProjectStorage();
  await database.transaction("rw", database.projects, database.projectBackgrounds, async () => {
    await database.projects.clear();
    await database.projectBackgrounds.clear();
  });
}

function backgroundAssetId(projectId: string, fingerprint: string): string {
  return `${projectId}:${fingerprint}`;
}

export async function saveProjectBackgroundAsset(options: {
  readonly projectId: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly fingerprint: string;
  readonly mimeType: string;
  readonly blob: Blob;
}): Promise<void> {
  ensureProjectStorage();
  const record: StoredProjectBackgroundRecord = {
    id: backgroundAssetId(options.projectId, options.fingerprint),
    projectId: options.projectId,
    fingerprint: options.fingerprint,
    fileName: options.fileName,
    fileSize: options.fileSize,
    mimeType: options.mimeType,
    blob: options.blob,
    savedAt: Date.now(),
  };
  await database.transaction("rw", database.projectBackgrounds, async () => {
    await database.projectBackgrounds.where("projectId").equals(options.projectId).delete();
    await database.projectBackgrounds.put(record);
  });
}

export async function loadProjectBackgroundAsset(options: {
  readonly projectId: string;
  readonly backgroundImage?: VisualTheme["backgroundImage"];
}): Promise<Blob | null> {
  ensureProjectStorage();
  const metadata = options.backgroundImage;
  if (!metadata) return null;
  const record = await database.projectBackgrounds.get(
    backgroundAssetId(options.projectId, metadata.fingerprint),
  );
  if (
    !record ||
    record.fileName !== metadata.fileName ||
    record.fileSize !== metadata.fileSize ||
    record.blob.size !== metadata.fileSize
  ) {
    return null;
  }
  return record.blob;
}

export async function deleteProjectBackgroundAsset(projectId: string): Promise<void> {
  ensureProjectStorage();
  await database.projectBackgrounds.where("projectId").equals(projectId).delete();
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
