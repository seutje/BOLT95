import type { RuntimeCapabilities } from "../../infrastructure/capabilities/runtime";

interface CapabilitySummaryProps {
  readonly capabilities: RuntimeCapabilities | null;
  readonly onDetails: () => void;
}

const modeLabels = {
  standard: "Standard mode",
  compatibility: "Compatibility mode",
  unsupported: "Unsupported browser",
} as const;

export function CapabilitySummary({ capabilities, onDetails }: CapabilitySummaryProps) {
  if (!capabilities) {
    return (
      <section className="group-box capability-summary" aria-labelledby="device-title">
        <h2 id="device-title">Device readiness</h2>
        <p role="status">Checking this browser…</p>
      </section>
    );
  }

  return (
    <section className="group-box capability-summary" aria-labelledby="device-title">
      <h2 id="device-title">Device readiness</h2>
      <p>
        <span className={`mode-badge mode-${capabilities.mode}`}>
          {modeLabels[capabilities.mode]}
        </span>
      </p>
      <p>{capabilities.modeReason}</p>
      <dl className="compact-facts">
        <div>
          <dt>Local transcription</dt>
          <dd>
            {capabilities.webAssembly && capabilities.webWorkers ? "Available" : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Video path</dt>
          <dd>
            {capabilities.supportedVideoConfigs.some((configuration) => configuration.supported)
              ? "Detected"
              : "Timed text only"}
          </dd>
        </div>
        <div>
          <dt>Isolation required</dt>
          <dd>No</dd>
        </div>
      </dl>
      <button type="button" onClick={onDetails}>
        Details…
      </button>
    </section>
  );
}
