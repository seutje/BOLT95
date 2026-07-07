import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyEditorCommand,
  createEditorSession,
  type EditorSession,
} from "../../app/commands/editor/commands";
import {
  createEditorProject,
  parseProjectFile,
  projectExportName,
  serializeProjectFile,
} from "../../app/commands/editor/project";
import { buildInfo } from "../../app/buildInfo";
import type { AlignmentResult } from "../../domain/alignment/engine";
import type { EditorProject } from "../../domain/project/schema";
import {
  clearProjects,
  deleteProject,
  listProjects,
  saveProject,
} from "../../infrastructure/storage/projects";
import { fingerprintBytes } from "../../media/audio/fingerprint";
import { importAudio } from "../../media/audio/importAudio";
import { AudioPlaybackClock } from "../../media/audio/playback";
import type { AudioImportResult } from "../../media/audio/types";

interface TimelineEditorWorkspaceProps {
  readonly audio: AudioImportResult | null;
  readonly alignment: AlignmentResult | null;
  readonly restoredProject?: EditorProject | null;
  readonly onAudioRelink: (audio: AudioImportResult) => void;
}

function msToSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function secondsToMs(value: string): number {
  return Math.round(Number(value) * 1000);
}

function drawTimeline(
  canvas: HTMLCanvasElement,
  project: EditorProject,
  audio: AudioImportResult,
  currentTimeMs: number,
  zoom: number,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, rect.width, rect.height);
  context.strokeStyle = "#808080";
  context.strokeRect(0.5, 0.5, rect.width - 1, rect.height - 1);

  const visibleDuration = project.audio.durationMs / zoom;
  const start = Math.max(0, currentTimeMs - visibleDuration / 2);
  const end = Math.min(project.audio.durationMs, start + visibleDuration);
  const toX = (ms: number) => ((ms - start) / (end - start || 1)) * rect.width;
  const mid = rect.height * 0.45;
  context.strokeStyle = "#000080";
  context.beginPath();
  const buckets = audio.waveform.max.length;
  for (let index = 0; index < buckets; index += 1) {
    const bucketMs = (index / buckets) * project.audio.durationMs;
    if (bucketMs < start || bucketMs > end) continue;
    const x = toX(bucketMs);
    const y = mid - Math.abs(audio.waveform.max[index] ?? 0) * mid;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.strokeStyle = "#008080";
  context.beginPath();
  for (let index = 0; index < buckets; index += 1) {
    const bucketMs = (index / buckets) * project.audio.durationMs;
    if (bucketMs < start || bucketMs > end) continue;
    const x = toX(bucketMs);
    const y = mid + Math.abs(audio.waveform.min[index] ?? 0) * mid;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();

  for (const line of project.lines) {
    if (line.endMs < start || line.startMs > end) continue;
    const x = toX(line.startMs);
    const width = Math.max(2, toX(line.endMs) - x);
    context.fillStyle = line.reviewState === "accepted" ? "#dff5df" : "#fff4bf";
    context.fillRect(x, rect.height * 0.66, width, rect.height * 0.22);
    context.strokeStyle = "#000";
    context.strokeRect(x, rect.height * 0.66, width, rect.height * 0.22);
  }

  const playheadX = toX(currentTimeMs);
  context.strokeStyle = "#c00000";
  context.beginPath();
  context.moveTo(playheadX, 0);
  context.lineTo(playheadX, rect.height);
  context.stroke();
}

export function TimelineEditorWorkspace({
  audio,
  alignment,
  restoredProject = null,
  onAudioRelink,
}: TimelineEditorWorkspaceProps) {
  const initialProject = useMemo(
    () => restoredProject ?? (audio && alignment ? createEditorProject(audio, alignment) : null),
    [audio, alignment, restoredProject],
  );
  const [session, setSession] = useState<EditorSession | null>(() =>
    initialProject ? createEditorSession(initialProject) : null,
  );
  const [savedProjects, setSavedProjects] = useState<readonly EditorProject[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("Editor ready.");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clockRef = useRef<AudioPlaybackClock | null>(null);
  const project = session?.project ?? null;

  useEffect(() => {
    void listProjects()
      .then(setSavedProjects)
      .catch(() => setSavedProjects([]));
  }, []);

  useEffect(() => {
    if (!audio) return undefined;
    const clock = new AudioPlaybackClock(audio.objectUrl);
    clockRef.current = clock;
    const tick = window.setInterval(() => {
      const snapshot = clock.snapshot;
      setCurrentTimeMs(snapshot.currentTimeMs);
      setPlaying(snapshot.playing);
    }, 100);
    return () => {
      window.clearInterval(tick);
      clock.dispose();
      if (clockRef.current === clock) clockRef.current = null;
    };
  }, [audio]);

  useEffect(() => {
    if (!project) return undefined;
    const timeout = window.setTimeout(() => {
      void saveProject(project)
        .then(() => {
          setStatus("Autosaved locally.");
          return listProjects();
        })
        .then(setSavedProjects)
        .catch(() => setStatus("Autosave failed. Export project JSON for a manual backup."));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [project]);

  useEffect(() => {
    if (!project || !audio || !canvasRef.current) return;
    drawTimeline(canvasRef.current, project, audio, currentTimeMs, zoom);
  }, [audio, currentTimeMs, project, zoom]);

  function run(command: Parameters<typeof applyEditorCommand>[1]): void {
    setSession((current) => (current ? applyEditorCommand(current, command) : current));
  }

  async function togglePlayback(): Promise<void> {
    if (!audio || !clockRef.current) return;
    try {
      if (playing) clockRef.current.pause();
      else await clockRef.current.play();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Playback failed: ${error.message}`
          : "Playback failed. Relink the audio and try again.",
      );
    }
  }

  function selectedIndex(): number {
    if (!session?.selectedLineId) return -1;
    return session.project.lines.findIndex((line) => line.id === session.selectedLineId);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    const target = event.target as HTMLElement;
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    if (typing && !(event.metaKey || event.ctrlKey)) return;
    if (!session) return;
    const selected = session.selectedLineId;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      run(event.shiftKey ? { type: "redo" } : { type: "undo" });
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      run({ type: "redo" });
    } else if (event.code === "Space") {
      event.preventDefault();
      void togglePlayback();
    } else if (selected && event.key === "ArrowLeft") {
      event.preventDefault();
      run({ type: "nudge", lineId: selected, deltaMs: event.shiftKey ? -100 : -10 });
    } else if (selected && event.key === "ArrowRight") {
      event.preventDefault();
      run({ type: "nudge", lineId: selected, deltaMs: event.shiftKey ? 100 : 10 });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = selectedIndex();
      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      const line = session.project.lines[next];
      if (line) run({ type: "select", lineId: line.id });
    }
  }

  function exportProject(): void {
    if (!session) return;
    const payload = JSON.stringify(serializeProjectFile(session.project, buildInfo), null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = projectExportName(session.project);
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Project JSON exported without audio.");
  }

  async function importProject(file: File): Promise<void> {
    try {
      const parsed = parseProjectFile(JSON.parse(await file.text()));
      setSession(createEditorSession(parsed.project));
      setStatus("Project JSON imported. Relink audio before playback if needed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Project import failed.");
    }
  }

  async function relinkAudio(file: File): Promise<void> {
    if (!session) return;
    setStatus("Checking relinked audio fingerprint...");
    const fingerprint = await fingerprintBytes(await file.arrayBuffer());
    if (fingerprint !== session.project.audio.fingerprint) {
      setStatus("Relinked audio fingerprint does not match this project.");
      return;
    }
    setStatus("Fingerprint matches. Preparing audio for playback...");
    try {
      const imported = await importAudio(file, {
        signal: new AbortController().signal,
        onProgress: (job) => setStatus(job.message ?? "Preparing relinked audio..."),
      });
      onAudioRelink(imported);
      setStatus("Relinked audio fingerprint matches the project. Playback is ready.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Relink failed: ${error.message}`
          : "Relink failed. Choose the original MP3 and try again.",
      );
    }
  }

  if (!session) {
    return (
      <section className="workspace-main" aria-labelledby="timeline-title">
        <div className="hero-copy compact-hero">
          <p className="eyebrow">EDIT</p>
          <h2 id="timeline-title">Timeline editor</h2>
          <p>Complete alignment or resume an autosaved project before editing the timeline.</p>
        </div>
      </section>
    );
  }

  const activeLine =
    session.project.lines.find(
      (line) => currentTimeMs >= line.startMs && currentTimeMs < line.endMs,
    ) ?? null;

  return (
    <section
      className="workspace-main timeline-editor"
      aria-labelledby="timeline-title"
      onKeyDown={handleKeyDown}
    >
      <div className="hero-copy compact-hero">
        <p className="eyebrow">EDIT</p>
        <h2 id="timeline-title">Timeline editor</h2>
        <p>
          {audio
            ? activeLine
              ? `Active line: ${activeLine.text}`
              : "No active line at the playhead."
            : "Audio is not linked. Editing remains available; relink audio for playback."}
        </p>
      </div>

      <section className="group-box import-group" aria-labelledby="transport-title">
        <h2 id="transport-title">Transport</h2>
        <div className="timeline-toolbar">
          <button type="button" disabled={!audio} onClick={() => void togglePlayback()}>
            {playing ? "Pause" : "Play"}
          </button>
          <label>
            Current time
            <input
              type="number"
              step="0.001"
              value={msToSeconds(currentTimeMs)}
              disabled={!audio}
              onChange={(event) => clockRef.current?.seek(secondsToMs(event.currentTarget.value))}
            />
          </label>
          <label>
            Zoom
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              value={zoom}
              onChange={(event) => setZoom(Number(event.currentTarget.value))}
            />
          </label>
          <button
            type="button"
            disabled={!session.history.past.length}
            onClick={() => run({ type: "undo" })}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!session.history.future.length}
            onClick={() => run({ type: "redo" })}
          >
            Redo
          </button>
        </div>
        {audio ? (
          <canvas ref={canvasRef} className="timeline-canvas" aria-label="Waveform timeline" />
        ) : (
          <p className="import-warning">
            Audio bytes are not stored in autosaves or project JSON. Relink the MP3 to verify its
            fingerprint and restore playback.
          </p>
        )}
        <p role="status" aria-live="polite">
          {session.error ?? status}
        </p>
      </section>

      <section className="group-box import-group" aria-labelledby="line-editor-title">
        <h2 id="line-editor-title">Lines</h2>
        <div className="timeline-table-wrap">
          <table className="alignment-table timeline-table">
            <thead>
              <tr>
                <th scope="col">Text</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Review</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {session.project.lines.map((line) => (
                <tr
                  key={line.id}
                  className={line.id === session.selectedLineId ? "timeline-selected" : undefined}
                >
                  <td>
                    <textarea
                      aria-label={`Line text ${line.text}`}
                      value={line.text}
                      rows={2}
                      onFocus={() => run({ type: "select", lineId: line.id })}
                      onChange={(event) =>
                        run({ type: "edit-text", lineId: line.id, text: event.currentTarget.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Start time ${line.text}`}
                      type="number"
                      step="0.001"
                      value={msToSeconds(line.startMs)}
                      onFocus={() => run({ type: "select", lineId: line.id })}
                      onChange={(event) =>
                        run({
                          type: "set-time",
                          lineId: line.id,
                          field: "startMs",
                          valueMs: secondsToMs(event.currentTarget.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`End time ${line.text}`}
                      type="number"
                      step="0.001"
                      value={msToSeconds(line.endMs)}
                      onFocus={() => run({ type: "select", lineId: line.id })}
                      onChange={(event) =>
                        run({
                          type: "set-time",
                          lineId: line.id,
                          field: "endMs",
                          valueMs: secondsToMs(event.currentTarget.value),
                        })
                      }
                    />
                  </td>
                  <td>{line.reviewState}</td>
                  <td className="line-actions">
                    <button
                      type="button"
                      onClick={() =>
                        run({
                          type: "set-boundary-at-playhead",
                          lineId: line.id,
                          field: "startMs",
                          playheadMs: currentTimeMs,
                        })
                      }
                    >
                      Set start
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run({
                          type: "set-boundary-at-playhead",
                          lineId: line.id,
                          field: "endMs",
                          playheadMs: currentTimeMs,
                        })
                      }
                    >
                      Set end
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run({
                          type: "split",
                          lineId: line.id,
                          offset: Math.round(line.text.length / 2),
                        })
                      }
                    >
                      Split
                    </button>
                    <button
                      type="button"
                      onClick={() => run({ type: "merge-next", lineId: line.id })}
                    >
                      Merge
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run({ type: "set-reviewed", lineId: line.id, reviewState: "accepted" })
                      }
                    >
                      Reviewed
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="group-box import-group" aria-labelledby="project-storage-title">
        <h2 id="project-storage-title">Project storage</h2>
        <div className="timeline-toolbar">
          <button type="button" onClick={exportProject}>
            Export JSON
          </button>
          <label className="button-label">
            Import JSON
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importProject(file);
              }}
            />
          </label>
          <label className="button-label">
            Relink audio
            <input
              className="sr-only"
              type="file"
              accept="audio/mpeg,.mp3"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void relinkAudio(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              void clearProjects().then(() => {
                setSavedProjects([]);
                setStatus(
                  "Local project data cleared. Browser storage eviction may also remove autosaves.",
                );
              });
            }}
          >
            Clear local data
          </button>
        </div>
        {savedProjects.length > 0 ? (
          <ul className="saved-projects">
            {savedProjects.map((project) => (
              <li key={project.id}>
                <button type="button" onClick={() => setSession(createEditorSession(project))}>
                  {project.title}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deleteProject(project.id).then(listProjects).then(setSavedProjects);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No autosaved projects yet.</p>
        )}
      </section>
    </section>
  );
}
