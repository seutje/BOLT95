import Dexie, { type EntityTable } from "dexie";
import { AppError } from "../../app/errors/AppError";
import type { WhisperModelDescriptor } from "../../domain/models/manifest";
import type { ModelCacheEntry } from "../../media/transcription/types";

interface StoredModelRecord extends ModelCacheEntry {
  readonly blob: Blob;
}

class ModelCacheDatabase extends Dexie {
  models!: EntityTable<StoredModelRecord, "id">;

  constructor() {
    super("bolt95-model-cache");
    this.version(1).stores({
      models: "id, storedAt, suppliedByUser",
    });
  }
}

const database = new ModelCacheDatabase();

export function hasModelStorage(): boolean {
  return typeof indexedDB !== "undefined";
}

function storageError(message: string, technicalDetail: string): AppError {
  return new AppError("STORAGE_UNAVAILABLE", message, {
    technicalDetail,
    recoveryAction: "Check browser storage permissions or clear site data and retry.",
  });
}

function ensureModelStorage(): void {
  if (!hasModelStorage()) {
    throw storageError("Model cache is unavailable.", "indexedDB is undefined");
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyModelBlob(
  blob: Blob,
  expected: Pick<WhisperModelDescriptor, "sizeBytes" | "sha256" | "displayName">,
): Promise<void> {
  if (blob.size !== expected.sizeBytes) {
    throw new AppError("INPUT_INVALID", "Model file size does not match the registry.", {
      technicalDetail: `${expected.displayName}: received ${blob.size}, expected ${expected.sizeBytes}`,
      recoveryAction: "Download the model again or choose a compatible GGML file.",
    });
  }
  const actual = await sha256Hex(blob);
  if (actual !== expected.sha256) {
    throw new AppError("INPUT_INVALID", "Model integrity check failed.", {
      technicalDetail: `${expected.displayName}: SHA-256 ${actual}`,
      recoveryAction: "Remove the cached model and download it again.",
    });
  }
}

export async function storeModelBlob(
  descriptor: Pick<WhisperModelDescriptor, "id" | "displayName" | "sizeBytes" | "sha256">,
  blob: Blob,
  suppliedByUser = false,
): Promise<ModelCacheEntry> {
  await verifyModelBlob(blob, descriptor);
  const entry: ModelCacheEntry = {
    id: descriptor.id,
    displayName: descriptor.displayName,
    sizeBytes: descriptor.sizeBytes,
    sha256: descriptor.sha256,
    storedAt: Date.now(),
    suppliedByUser,
  };
  ensureModelStorage();
  await database.transaction("rw", database.models, async () => {
    await database.models.put({ ...entry, blob });
  });
  return entry;
}

export async function getCachedModelBlob(modelId: string): Promise<Blob | null> {
  ensureModelStorage();
  const record = await database.models.get(modelId);
  return record?.blob ?? null;
}

export async function listCachedModels(): Promise<readonly ModelCacheEntry[]> {
  ensureModelStorage();
  const records = await database.models.toArray();
  return records.map(({ blob: _blob, ...entry }) => entry);
}

export async function deleteCachedModel(modelId: string): Promise<void> {
  ensureModelStorage();
  await database.models.delete(modelId);
}

export async function clearCachedModels(): Promise<void> {
  ensureModelStorage();
  await database.models.clear();
}

export function cacheSizeBytes(entries: readonly ModelCacheEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
}
