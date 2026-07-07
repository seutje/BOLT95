const SAFE_DOWNLOAD_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,119}$/u;

export function sanitizeDownloadName(fileName: string, fallback = "bolt95-export.txt"): string {
  const clean = fileName
    .normalize("NFKD")
    .split("")
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 ||
        code === 127 ||
        character === "/" ||
        character === "\\" ||
        character === ":"
        ? "-"
        : character;
    })
    .join("")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+(\.[\p{L}\p{N}]+)$/gu, "$1")
    .replace(/^\.+/u, "")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
  if (SAFE_DOWNLOAD_NAME.test(clean)) return clean;
  return fallback;
}

export function textBlob(content: string, mimeType: string): Blob {
  return new Blob([content], { type: mimeType });
}

export function downloadBlob(blob: Blob, requestedName: string): string {
  const fileName = sanitizeDownloadName(requestedName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return fileName;
}

export function downloadText(content: string, mimeType: string, requestedName: string): string {
  return downloadBlob(textBlob(content, mimeType), requestedName);
}
