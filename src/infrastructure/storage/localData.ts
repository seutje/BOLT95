import { clearCachedModels } from "./models";
import { clearProjects } from "./projects";

export interface LocalDataClearResult {
  readonly projectsCleared: boolean;
  readonly modelsCleared: boolean;
  readonly cacheNamesDeleted: readonly string[];
}

async function deleteShellCaches(): Promise<readonly string[]> {
  if (!("caches" in globalThis)) return [];
  const names = await caches.keys();
  const bolt95Caches = names.filter((name) => name.startsWith("bolt95-"));
  await Promise.all(bolt95Caches.map((name) => caches.delete(name)));
  return bolt95Caches;
}

export async function clearLocalData(): Promise<LocalDataClearResult> {
  await clearProjects();
  await clearCachedModels();

  const cacheNamesDeleted = await deleteShellCaches();
  return { projectsCleared: true, modelsCleared: true, cacheNamesDeleted };
}
