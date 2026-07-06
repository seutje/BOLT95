function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function resolveAssetUrl(
  relativePath: string,
  basePath: string,
  origin = "https://bolt95.invalid",
): string {
  const normalizedPath = relativePath.replace(/^\/+/, "");
  const normalizedBase = ensureTrailingSlash(basePath.startsWith("/") ? basePath : `/${basePath}`);
  const baseUrl = new URL(normalizedBase, origin);
  return new URL(normalizedPath, baseUrl).href;
}

export function assetUrl(relativePath: string): string {
  return resolveAssetUrl(relativePath, import.meta.env.BASE_URL, window.location.origin);
}

export const runtimeAssetUrls = {
  modelManifest: (): string => assetUrl("config/models.json"),
  whisperModule: (): string => assetUrl("wasm/generated/whisper.js"),
  whisperWasm: (): string => assetUrl("wasm/generated/whisper.wasm"),
  model: (fileName: string): string => assetUrl(`models/${fileName}`),
};
