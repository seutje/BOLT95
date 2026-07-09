import { useEffect, useMemo, useRef, useState } from "react";
import { buildInfo } from "../../app/buildInfo";
import { useAppStore } from "../../app/state/store";
import { serializeProjectFile, projectExportName } from "../../app/commands/editor/project";
import type { CaptionFormat } from "../../domain/captions/serializers";
import { serializeCaptionExport } from "../../domain/captions/serializers";
import type { EditorProject } from "../../domain/project/schema";
import type { RenderPreset } from "../../domain/rendering/schema";
import { downloadBlob, downloadText } from "../../infrastructure/downloads/blobDownload";
import type { AudioImportResult } from "../../media/audio/types";
import {
  draftPresetForProject,
  exportDurationMs,
  estimateDraftExportRisk,
  fullExportPresets,
  probeMediaRecorderBackend,
  probeDraftVideoBackend,
  probeMp4VideoBackend,
  videoExportPresets,
  videoPresetForProject,
  type DraftExportProgress,
  type DraftExportResult,
  type DraftVideoBackend,
} from "../../media/export/backend";
import { exportMediaRecorderWebm } from "../../media/export/mediarecorder/canvasWebm";
import { exportDraftWebm } from "../../media/export/webcodecs/draftWebm";
import { exportWebCodecsMp4 } from "../../media/export/webcodecs/mp4";

interface ExportWorkspaceProps {
  readonly audio: AudioImportResult | null;
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

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1_000).toFixed(2)} s`;
}

function exportErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError")
    return "Video export cancelled.";
  return error instanceof Error ? error.message : "Video export failed.";
}

function jobPhaseForProgress(phase: DraftExportProgress["phase"]) {
  if (phase === "frames" || phase === "audio" || phase === "verifying") return "processing";
  return phase;
}

export function ExportWorkspace({ audio, project }: ExportWorkspaceProps) {
  const setCurrentJob = useAppStore((state) => state.setCurrentJob);
  const [format, setFormat] = useState<CaptionFormat>("lrc");
  const [presetId, setPresetId] = useState<RenderPreset>(() =>
    project ? draftPresetForProject(project).id : "landscape-draft",
  );
  const [status, setStatus] = useState("Choose a format to preview and download.");
  const [videoStatus, setVideoStatus] = useState("Checking video export support.");
  const [backends, setBackends] = useState<readonly DraftVideoBackend[]>([]);
  const [backendId, setBackendId] = useState<DraftVideoBackend["id"]>("webcodecs-mp4");
  const [videoResult, setVideoResult] = useState<DraftExportResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const exportPayload = useMemo(() => {
    if (!project) return null;
    return format === "project-json"
      ? projectJsonExport(project)
      : serializeCaptionExport(project, format);
  }, [format, project]);
  const selectedPreset = useMemo(
    () => (project ? videoPresetForProject(project, presetId) : videoExportPresets[2]!),
    [presetId, project],
  );
  const backend = useMemo(
    () =>
      backends.find((candidate) => candidate.id === backendId) ??
      backends.find((candidate) => candidate.supported) ??
      null,
    [backendId, backends],
  );
  const risk = useMemo(
    () => (audio ? estimateDraftExportRisk(selectedPreset, audio, backend) : null),
    [audio, backend, selectedPreset],
  );
  const qualifiedFullPresets = useMemo(
    () =>
      audio
        ? fullExportPresets.filter(
            (preset) => estimateDraftExportRisk(preset, audio, backend).qualified,
          )
        : [],
    [audio, backend],
  );
  const displayedPresets = useMemo(
    () => [
      ...videoExportPresets.filter((preset) => preset.mode === "draft"),
      ...qualifiedFullPresets,
    ],
    [qualifiedFullPresets],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      probeMp4VideoBackend(selectedPreset),
      probeDraftVideoBackend(selectedPreset),
      Promise.resolve(probeMediaRecorderBackend()),
    ])
      .then((results) => {
        if (cancelled) return;
        setBackends(results);
        const preferred = results.find((candidate) => candidate.supported) ?? results[0]!;
        setBackendId((current) =>
          results.find((candidate) => candidate.id === current)?.supported ? current : preferred.id,
        );
        setVideoStatus(
          preferred.supported
            ? `${preferred.label} is available.`
            : results.map((candidate) => candidate.detail).join(" "),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBackends([]);
        setVideoStatus(error instanceof Error ? error.message : "Draft video probe failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPreset]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

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

  async function startVideoExport(): Promise<void> {
    if (!project || !audio || !backend?.supported || !risk?.qualified) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const jobId = crypto.randomUUID();
    setExporting(true);
    setProgress(0);
    setVideoResult(null);
    setVideoStatus("Preparing video export.");
    try {
      const progressHandler = (update: DraftExportProgress) => {
        setProgress(update.progress);
        setVideoStatus(update.message);
        setCurrentJob({
          id: jobId,
          type: "encode",
          phase: jobPhaseForProgress(update.phase),
          progress: update.progress,
          message: update.message,
        });
      };
      const result =
        backend.id === "webcodecs-mp4"
          ? await exportWebCodecsMp4({
              project,
              audio,
              backend,
              presetId,
              signal: controller.signal,
              onProgress: progressHandler,
            })
          : backend.id === "mediarecorder-webm"
            ? await exportMediaRecorderWebm({
                project,
                audio,
                backend,
                presetId,
                signal: controller.signal,
                onProgress: progressHandler,
              })
            : await exportDraftWebm({
                project,
                audio,
                backend,
                presetId,
                signal: controller.signal,
                onProgress: progressHandler,
              });
      setVideoResult(result);
      setCurrentJob({
        id: jobId,
        type: "encode",
        phase: "completed",
        progress: 1,
        message: `${result.backend.container.toUpperCase()} ready.`,
      });
      setVideoStatus(
        `Video ready: ${formatBytes(result.blob.size)}, drift ${result.durationDriftMs} ms.`,
      );
    } catch (error) {
      const message = exportErrorMessage(error);
      setVideoStatus(message);
      setCurrentJob({
        id: jobId,
        type: "encode",
        phase: message.includes("cancelled") ? "cancelled" : "failed",
        progress,
        message,
      });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setExporting(false);
    }
  }

  function downloadVideo(): void {
    if (!videoResult) return;
    const fileName = downloadBlob(videoResult.blob, videoResult.fileName);
    setVideoStatus(`${fileName} downloaded.`);
  }

  return (
    <section className="workspace-main export-workspace" aria-labelledby="export-title">
      <div className="hero-copy compact-hero">
        <p className="eyebrow">EXPORT</p>
        <h2 id="export-title">Timed-text export</h2>
        <p>
          Subtitle export remains available without video APIs. MP4 uses local WebCodecs H.264 when
          available; WebM remains available as the fallback path.
        </p>
      </div>

      <section className="group-box import-group" aria-labelledby="video-export-title">
        <h2 id="video-export-title">Video</h2>
        <div className="export-format-list" role="radiogroup" aria-label="Video backend">
          {backends.map((option) => (
            <label key={option.id}>
              <input
                type="radio"
                name="video-backend"
                value={option.id}
                checked={backend?.id === option.id}
                disabled={!option.supported || exporting}
                onChange={() => setBackendId(option.id)}
              />
              <span>{option.label}</span>
              <small>
                {option.supported ? `${option.mimeType} · ${option.detail}` : option.detail}
                {!option.supported && option.id === "webcodecs-mp4"
                  ? " Use WebM export on this browser."
                  : ""}
              </small>
            </label>
          ))}
        </div>
        <div className="export-format-list" role="radiogroup" aria-label="Video preset">
          {displayedPresets.map((option) => (
            <label key={option.id}>
              <input
                type="radio"
                name="video-preset"
                value={option.id}
                checked={presetId === option.id}
                disabled={exporting}
                onChange={() => setPresetId(option.id)}
              />
              <span>{option.label}</span>
              <small>
                {option.width}x{option.height}
                {option.mode === "full" ? " · full duration" : ""}
              </small>
            </label>
          ))}
        </div>
        {qualifiedFullPresets.length === 0 && backend?.supported && (
          <p className="field-hint">
            Full presets are hidden until this device, backend, and source fit the recorded Phase 10
            limits.
          </p>
        )}
        <dl className="file-facts">
          <div>
            <dt>Backend</dt>
            <dd>{backend ? backend.label : "Checking"}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>
              {audio && project
                ? formatSeconds(exportDurationMs(project, audio, selectedPreset))
                : "Relink audio"}
            </dd>
          </div>
          <div>
            <dt>Workload</dt>
            <dd>
              {risk
                ? `${risk.estimatedFrames} frames · ${risk.level} risk`
                : "Waiting for audio and probes"}
            </dd>
          </div>
        </dl>
        {risk && risk.reasons.length > 0 && (
          <ul className="alignment-issues export-warnings">
            {risk.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {risk && risk.blockers.length > 0 && (
          <ul className="alignment-issues export-warnings">
            {risk.blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {exporting && (
          <div className="job-progress" role="status" aria-live="polite">
            <progress value={progress} max="1" />
            <span>{videoStatus}</span>
            <button type="button" onClick={() => controllerRef.current?.abort()}>
              Cancel
            </button>
          </div>
        )}
        {!exporting && (
          <p role="status" aria-live="polite">
            {videoStatus}
          </p>
        )}
        <div className="lyrics-actions">
          <button
            type="button"
            disabled={!audio || !backend?.supported || !risk?.qualified || exporting}
            onClick={() => {
              void startVideoExport();
            }}
          >
            Export {selectedPreset.mode === "draft" ? "Draft " : ""}
            {backend?.container === "mp4" ? "MP4" : "WebM"}
          </button>
          <button type="button" disabled={!videoResult || exporting} onClick={downloadVideo}>
            Download {videoResult?.preset.mode === "draft" ? "Draft " : ""}
            {videoResult?.backend.container === "mp4" ? "MP4" : "WebM"}
          </button>
        </div>
        {videoResult && (
          <dl className="file-facts">
            <div>
              <dt>Name</dt>
              <dd>{videoResult.fileName}</dd>
            </div>
            <div>
              <dt>MIME</dt>
              <dd>{videoResult.mimeType}</dd>
            </div>
            <div>
              <dt>Verification</dt>
              <dd>
                {formatSeconds(videoResult.verifiedDurationMs)} · {videoResult.durationDriftMs} ms
                drift · {videoResult.encodedPackets} packets
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="group-box import-group" aria-labelledby="export-controls-title">
        <h2 id="export-controls-title">Timed text</h2>
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
