import { useMemo, useState } from "react";
import { buildInfo } from "../../app/buildInfo";
import { serializeProjectFile, projectExportName } from "../../app/commands/editor/project";
import type { CaptionFormat } from "../../domain/captions/serializers";
import { serializeCaptionExport } from "../../domain/captions/serializers";
import type { EditorProject } from "../../domain/project/schema";
import { downloadText } from "../../infrastructure/downloads/blobDownload";

interface ExportWorkspaceProps {
  readonly project: EditorProject | null;
}

const formats: readonly {
  readonly id: CaptionFormat;
  readonly label: string;
  readonly extension: string;
}[] = [
  { id: "lrc", label: "Plain LRC", extension: ".lrc" },
  { id: "enhanced-lrc", label: "Enhanced LRC", extension: ".enhanced.lrc" },
  { id: "srt", label: "SubRip SRT", extension: ".srt" },
  { id: "vtt", label: "WebVTT", extension: ".vtt" },
  { id: "project-json", label: "Project JSON", extension: ".bolt95.json" },
];

function projectJsonExport(project: EditorProject) {
  return {
    format: "project-json" as const,
    fileName: projectExportName(project),
    mimeType: "application/json; charset=utf-8",
    content: JSON.stringify(serializeProjectFile(project, buildInfo), null, 2),
    warnings: [] as const,
  };
}

export function ExportWorkspace({ project }: ExportWorkspaceProps) {
  const [format, setFormat] = useState<CaptionFormat>("lrc");
  const [status, setStatus] = useState("Choose a format to preview and download.");
  const exportPayload = useMemo(() => {
    if (!project) return null;
    return format === "project-json"
      ? projectJsonExport(project)
      : serializeCaptionExport(project, format);
  }, [format, project]);

  if (!project) {
    return (
      <section className="workspace-main" aria-labelledby="export-title">
        <div className="hero-copy compact-hero">
          <p className="eyebrow">EXPORT</p>
          <h2 id="export-title">Timed-text export</h2>
          <p>Complete the timeline editor before exporting captions or project JSON.</p>
        </div>
      </section>
    );
  }

  function downloadCurrent(): void {
    if (!exportPayload) return;
    const fileName = downloadText(
      exportPayload.content,
      exportPayload.mimeType,
      exportPayload.fileName,
    );
    setStatus(`${fileName} downloaded.`);
  }

  return (
    <section className="workspace-main export-workspace" aria-labelledby="export-title">
      <div className="hero-copy compact-hero">
        <p className="eyebrow">EXPORT</p>
        <h2 id="export-title">Timed-text export</h2>
        <p>
          Subtitle and project exports do not use video APIs. Review warnings, inspect the text, and
          download the exact UTF-8 content shown here.
        </p>
      </div>

      <section className="group-box import-group" aria-labelledby="export-controls-title">
        <h2 id="export-controls-title">Format</h2>
        <div className="export-format-list" role="radiogroup" aria-label="Export format">
          {formats.map((option) => (
            <label key={option.id}>
              <input
                type="radio"
                name="export-format"
                value={option.id}
                checked={format === option.id}
                onChange={() => setFormat(option.id)}
              />
              <span>{option.label}</span>
              <small>{option.extension}</small>
            </label>
          ))}
        </div>
        <button type="button" disabled={!exportPayload} onClick={downloadCurrent}>
          Download {formats.find((option) => option.id === format)?.label}
        </button>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </section>

      {exportPayload && exportPayload.warnings.length > 0 && (
        <section className="group-box import-group" aria-labelledby="export-warnings-title">
          <h2 id="export-warnings-title">Warnings</h2>
          <ul className="alignment-issues export-warnings">
            {exportPayload.warnings.map((warning, index) => (
              <li key={`${warning.code}-${warning.lineId ?? "project"}-${index}`}>
                {warning.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {exportPayload && (
        <section className="group-box import-group" aria-labelledby="export-preview-title">
          <h2 id="export-preview-title">Text preview</h2>
          <dl className="file-facts">
            <div>
              <dt>Name</dt>
              <dd>{exportPayload.fileName}</dd>
            </div>
            <div>
              <dt>MIME</dt>
              <dd>{exportPayload.mimeType}</dd>
            </div>
          </dl>
          <pre className="export-preview">{exportPayload.content}</pre>
        </section>
      )}
    </section>
  );
}
