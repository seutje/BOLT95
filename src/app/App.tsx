import { useCallback, useEffect, useState } from "react";
import { buildInfo } from "./buildInfo";
import { useAppStore } from "./state/store";
import { CapabilitySummary } from "../components/common/CapabilitySummary";
import { ModalDialog } from "../components/common/ModalDialog";
import { StageNavigation } from "../components/common/StageNavigation";
import { ExportWorkspace } from "../components/export/ExportWorkspace";
import { ImportWorkspace } from "../components/import/ImportWorkspace";
import { AlignmentReviewWorkspace } from "../components/review/AlignmentReviewWorkspace";
import { StyleWorkspace } from "../components/style/StyleWorkspace";
import { TimelineEditorWorkspace } from "../components/timeline/TimelineEditorWorkspace";
import { TranscriptWorkspace } from "../components/transcript/TranscriptWorkspace";
import { availableWorkflowStages, canEnterWorkflowStage } from "./commands/workflow";
import type { EditorProject } from "../domain/project/schema";
import {
  probeRuntimeCapabilities,
  type RuntimeCapabilities,
} from "../infrastructure/capabilities/runtime";
import { createSafeDiagnostics } from "../infrastructure/diagnostics/diagnostics";
import { listProjects } from "../infrastructure/storage/projects";
import { releaseAudioImport } from "../media/audio/importAudio";
import type { AudioImportResult } from "../media/audio/types";

let capabilityProbe: Promise<RuntimeCapabilities> | undefined;

function getCapabilities(): Promise<RuntimeCapabilities> {
  capabilityProbe ??= probeRuntimeCapabilities();
  return capabilityProbe;
}

export function App() {
  const activeStage = useAppStore((state) => state.activeStage);
  const setActiveStage = useAppStore((state) => state.setActiveStage);
  const suppliedLyrics = useAppStore((state) => state.suppliedLyrics);
  const setSuppliedLyrics = useAppStore((state) => state.setSuppliedLyrics);
  const transcript = useAppStore((state) => state.transcript);
  const setTranscript = useAppStore((state) => state.setTranscript);
  const alignment = useAppStore((state) => state.alignment);
  const setAlignment = useAppStore((state) => state.setAlignment);
  const openDialog = useAppStore((state) => state.openDialog);
  const showDialog = useAppStore((state) => state.showDialog);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [capabilityFailure, setCapabilityFailure] = useState(false);
  const [audioSummary, setAudioSummary] = useState<{
    name: string;
    durationMs: number;
    risk: "low" | "moderate" | "high";
  } | null>(null);
  const [audioImport, setAudioImport] = useState<AudioImportResult | null>(null);
  const [restoredProject, setRestoredProject] = useState<EditorProject | null>(null);
  const [currentProject, setCurrentProject] = useState<EditorProject | null>(null);
  const [savedProjects, setSavedProjects] = useState<readonly EditorProject[]>([]);
  const workflowSnapshot = {
    hasAudio: audioImport !== null,
    hasTranscript: transcript !== null,
    hasAlignment: alignment !== null,
    hasEditorProject: currentProject !== null,
  };

  const handleProjectChange = useCallback((project: EditorProject | null) => {
    setCurrentProject(project);
  }, []);

  useEffect(() => {
    let mounted = true;
    void getCapabilities()
      .then((result) => {
        if (mounted) setCapabilities(result);
      })
      .catch(() => {
        if (mounted) setCapabilityFailure(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void listProjects()
      .then(setSavedProjects)
      .catch(() => setSavedProjects([]));
  }, []);

  useEffect(
    () => () => {
      if (audioImport) releaseAudioImport(audioImport);
    },
    [audioImport],
  );

  const diagnostics = capabilities
    ? createSafeDiagnostics(buildInfo, capabilities, navigator.userAgent)
    : null;

  return (
    <main className="desktop-shell">
      <section className="window app-window" aria-labelledby="app-title">
        <header className="title-bar app-title-bar">
          <div className="app-icon" aria-hidden="true">
            B
          </div>
          <h1 id="app-title">BOLT95 — Browser Only Lyric Transcription</h1>
          <div className="window-buttons" aria-hidden="true">
            <span>_</span>
            <span>□</span>
            <span>×</span>
          </div>
        </header>

        <div className="menu-bar" aria-label="Application menu">
          <button type="button" onClick={() => showDialog("privacy")}>
            <u>F</u>ile
          </button>
          <button type="button" onClick={() => showDialog("capabilities")}>
            <u>V</u>iew
          </button>
          <button type="button" onClick={() => showDialog("diagnostics")}>
            <u>H</u>elp
          </button>
        </div>

        <StageNavigation
          activeStage={activeStage}
          availableStages={availableWorkflowStages(workflowSnapshot)}
          onSelect={(stage) => {
            if (canEnterWorkflowStage(stage, workflowSnapshot)) setActiveStage(stage);
          }}
        />

        <div
          className={
            activeStage === "edit" || activeStage === "style" || activeStage === "export"
              ? "workspace workspace-full"
              : "workspace"
          }
        >
          {activeStage === "transcribe" ? (
            <TranscriptWorkspace
              audio={audioImport}
              onTranscriptReady={(result) => {
                setTranscript(result);
                setAlignment(null);
                setCurrentProject(null);
                setActiveStage("align");
              }}
            />
          ) : activeStage === "align" || activeStage === "review" ? (
            <AlignmentReviewWorkspace
              suppliedLyrics={suppliedLyrics}
              transcript={transcript}
              alignment={alignment}
              onAlignmentReady={(result) => {
                setAlignment(result);
                setCurrentProject(null);
              }}
            />
          ) : activeStage === "edit" ? (
            <TimelineEditorWorkspace
              audio={audioImport}
              alignment={alignment}
              restoredProject={restoredProject}
              onProjectChange={handleProjectChange}
              onAudioRelink={(audio) => {
                setAudioImport(audio);
                setAudioSummary({
                  name: audio.file.name,
                  durationMs: audio.durationMs,
                  risk: audio.risk,
                });
              }}
            />
          ) : activeStage === "style" ? (
            <StyleWorkspace
              audio={audioImport}
              project={currentProject}
              onProjectChange={handleProjectChange}
            />
          ) : activeStage === "export" ? (
            <ExportWorkspace project={currentProject} />
          ) : (
            <ImportWorkspace
              onAudioChange={(summary) => {
                setAudioSummary(summary);
                if (!summary) {
                  setAudioImport(null);
                  setRestoredProject(null);
                  setSuppliedLyrics(null);
                  setTranscript(null);
                  setAlignment(null);
                  setCurrentProject(null);
                }
              }}
              onContinue={(audio, lyrics) => {
                setAudioImport(audio);
                setRestoredProject(null);
                setCurrentProject(null);
                setSuppliedLyrics(lyrics);
                setTranscript(null);
                setAlignment(null);
                setActiveStage("transcribe");
              }}
            />
          )}

          {activeStage !== "edit" && (
            <aside className="workspace-sidebar">
              <CapabilitySummary
                capabilities={capabilities}
                onDetails={() => showDialog("capabilities")}
              />
              {capabilityFailure && (
                <p className="error-panel" role="alert">
                  Capability checks failed. Reload the page or use a current desktop browser.
                </p>
              )}
              <section className="group-box project-status" aria-labelledby="project-title">
                <h2 id="project-title">Current project</h2>
                <div className="empty-project" aria-hidden="true">
                  ♫
                </div>
                {audioSummary ? (
                  <>
                    <p className="project-file-name">{audioSummary.name}</p>
                    <p>
                      {Math.round(audioSummary.durationMs / 1000)} seconds · {audioSummary.risk}{" "}
                      risk
                    </p>
                  </>
                ) : (
                  <>
                    <p>No project loaded.</p>
                    <p>Select an MP3 to create an in-memory project input.</p>
                  </>
                )}
                {transcript && <p>{transcript.words.length} transcript words ready.</p>}
                {alignment && (
                  <p>
                    {alignment.lines.length} timed lines ·{" "}
                    {alignment.lines.filter((line) => line.reviewState !== "accepted").length} need
                    review
                  </p>
                )}
                {!audioImport && savedProjects.length > 0 && (
                  <div className="resume-projects">
                    <p>Autosaves available:</p>
                    {savedProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => {
                          setRestoredProject(project);
                          setAlignment(project.alignment);
                          setCurrentProject(project);
                          setAudioSummary({
                            name: project.audio.fileName,
                            durationMs: project.audio.durationMs,
                            risk: "low",
                          });
                          setActiveStage("edit");
                        }}
                      >
                        Resume {project.title}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          )}
        </div>

        <footer className="status-bar">
          <span>{audioSummary ? `Ready — ${audioSummary.name}` : "Ready — no project loaded"}</span>
          <span>{capabilities ? `${capabilities.mode} mode` : "checking device"}</span>
          <span>v{buildInfo.appVersion}</span>
        </footer>
      </section>

      <ModalDialog
        title="Runtime capabilities"
        open={openDialog === "capabilities"}
        onClose={closeDialog}
      >
        {capabilities ? (
          <>
            <p>{capabilities.modeReason}</p>
            <dl className="dialog-facts">
              <div>
                <dt>WebAssembly</dt>
                <dd>{String(capabilities.webAssembly)}</dd>
              </div>
              <div>
                <dt>Web Workers</dt>
                <dd>{String(capabilities.webWorkers)}</dd>
              </div>
              <div>
                <dt>Cross-origin isolated</dt>
                <dd>{String(capabilities.crossOriginIsolated)}</dd>
              </div>
              <div>
                <dt>SharedArrayBuffer</dt>
                <dd>{String(capabilities.sharedArrayBuffer)}</dd>
              </div>
              <div>
                <dt>IndexedDB</dt>
                <dd>{String(capabilities.indexedDb)}</dd>
              </div>
              {capabilities.supportedVideoConfigs.map((configuration) => (
                <div key={configuration.id}>
                  <dt>{configuration.label}</dt>
                  <dd>{configuration.supported ? "Available" : "Unavailable"}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p role="status">Capability check is still running.</p>
        )}
      </ModalDialog>

      <ModalDialog title="Local processing" open={openDialog === "privacy"} onClose={closeDialog}>
        <p>
          BOLT95 has no application server, analytics, account system, or upload API. Network
          requests are limited to static application files and model files you explicitly choose to
          download.
        </p>
        <p>Clearing site data removes locally cached projects and models.</p>
      </ModalDialog>

      <ModalDialog
        title="Safe diagnostics"
        open={openDialog === "diagnostics"}
        onClose={closeDialog}
      >
        <p>Diagnostics never include lyrics, transcripts, file names, paths, or media bytes.</p>
        <pre className="diagnostics-output">
          {diagnostics ? JSON.stringify(diagnostics, null, 2) : "Capability check pending."}
        </pre>
      </ModalDialog>
    </main>
  );
}
