import type { AlignmentResult } from "../../../domain/alignment/engine";
import {
  editorProjectSchemaV1,
  projectFileSchemaV1,
  type EditorLine,
  type EditorProject,
  type ProjectAudioLink,
  type ProjectFileV1,
} from "../../../domain/project/schema";
import type { AudioImportResult } from "../../../media/audio/types";

export interface ProjectBuildInfo {
  readonly appVersion: string;
}

export function audioLinkFromImport(audio: AudioImportResult): ProjectAudioLink {
  return {
    durationMs: audio.durationMs,
    fingerprint: audio.fingerprint,
    fileName: audio.file.name,
    fileSize: audio.file.size,
    format: audio.format,
  };
}

function lineStart(line: AlignmentResult["lines"][number], fallback: number): number {
  return line.startMs ?? fallback;
}

function lineEnd(
  line: AlignmentResult["lines"][number],
  startMs: number,
  durationMs: number,
): number {
  return Math.min(durationMs, Math.max(line.endMs ?? startMs + 600, startMs));
}

export function createEditorProject(
  audio: AudioImportResult,
  alignment: AlignmentResult,
  now = Date.now(),
): EditorProject {
  let fallback = 0;
  const lines = alignment.lines.map<EditorLine>((line) => {
    const startMs = lineStart(line, fallback);
    const endMs = lineEnd(line, startMs, audio.durationMs);
    fallback = endMs;
    return {
      id: line.lineId,
      text: line.displayText,
      startMs,
      endMs,
      provenance: line.provenance === "unresolved" ? "interpolated" : line.provenance,
      reviewState: line.reviewState,
    };
  });
  return editorProjectSchemaV1.parse({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: audio.file.name.replace(/\.[^.]+$/u, "") || "Untitled project",
    createdAt: now,
    updatedAt: now,
    audio: audioLinkFromImport(audio),
    alignment,
    lines,
  });
}

export function parseProjectFile(input: unknown): ProjectFileV1 {
  const version = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== 1) {
    throw new Error(`Unsupported project file schema version: ${String(version)}`);
  }
  return projectFileSchemaV1.parse(input);
}

export function serializeProjectFile(
  project: EditorProject,
  build: ProjectBuildInfo,
  now = Date.now(),
): ProjectFileV1 {
  return projectFileSchemaV1.parse({
    schemaVersion: 1,
    exportedAt: now,
    appVersion: build.appVersion,
    project,
  });
}

export function projectExportName(project: EditorProject): string {
  const base = project.title
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^\.+/u, "")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return `${base || "bolt95-project"}.bolt95.json`;
}
