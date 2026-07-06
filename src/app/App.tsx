import { useEffect, useState } from "react";
import { buildInfo } from "./buildInfo";
import { useAppStore } from "./state/store";
import { CapabilitySummary } from "../components/common/CapabilitySummary";
import { ModalDialog } from "../components/common/ModalDialog";
import { StageNavigation } from "../components/common/StageNavigation";
import {
  probeRuntimeCapabilities,
  type RuntimeCapabilities,
} from "../infrastructure/capabilities/runtime";
import { createSafeDiagnostics } from "../infrastructure/diagnostics/diagnostics";

let capabilityProbe: Promise<RuntimeCapabilities> | undefined;

function getCapabilities(): Promise<RuntimeCapabilities> {
  capabilityProbe ??= probeRuntimeCapabilities();
  return capabilityProbe;
}

export function App() {
  const activeStage = useAppStore((state) => state.activeStage);
  const setActiveStage = useAppStore((state) => state.setActiveStage);
  const openDialog = useAppStore((state) => state.openDialog);
  const showDialog = useAppStore((state) => state.showDialog);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [capabilityFailure, setCapabilityFailure] = useState(false);

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
          <h1 id="app-title">BOLT95 — Local Lyric Studio</h1>
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

        <StageNavigation activeStage={activeStage} onSelect={setActiveStage} />

        <div className="workspace">
          <section className="workspace-main" aria-labelledby="workspace-title">
            <div className="hero-copy">
              <p className="eyebrow">IMPORT</p>
              <h2 id="workspace-title">Create timed lyrics locally</h2>
              <p>
                Add an MP3 and optional lyrics. BOLT95 will transcribe, align, edit, preview, and
                export without sending your files anywhere.
              </p>
            </div>

            <aside className="privacy-notice" aria-label="Privacy notice">
              <span className="privacy-icon" aria-hidden="true">
                🔒
              </span>
              <div>
                <strong>Your media stays on this device.</strong>
                <p>
                  Audio, lyrics, transcripts, projects, and rendered videos are processed by your
                  browser and are never uploaded.
                </p>
              </div>
            </aside>

            <section className="group-box workflow-preview" aria-labelledby="next-title">
              <h2 id="next-title">What happens next</h2>
              <ol className="workflow-list">
                <li>
                  <span aria-hidden="true">1</span>
                  <div>
                    <strong>Import</strong>
                    <small>Choose audio and add canonical lyrics.</small>
                  </div>
                </li>
                <li>
                  <span aria-hidden="true">2</span>
                  <div>
                    <strong>Process locally</strong>
                    <small>Whisper finds timing evidence in a worker.</small>
                  </div>
                </li>
                <li>
                  <span aria-hidden="true">3</span>
                  <div>
                    <strong>Review and export</strong>
                    <small>Correct timing, style video, and download.</small>
                  </div>
                </li>
              </ol>
              <button type="button" disabled>
                Choose audio…
              </button>
              <p className="control-note">
                Audio import is enabled in the next implementation phase.
              </p>
            </section>
          </section>

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
              <p>No project loaded.</p>
              <p>Your latest local autosave will appear here in a later stage.</p>
            </section>
          </aside>
        </div>

        <footer className="status-bar">
          <span>Ready — no project loaded</span>
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
