import type { WorkflowStage } from "../../app/state/store";

interface StageDefinition {
  readonly id: WorkflowStage;
  readonly label: string;
  readonly available: boolean;
}

const stages: readonly StageDefinition[] = [
  { id: "import", label: "1. Import", available: true },
  { id: "transcribe", label: "2. Transcribe", available: false },
  { id: "align", label: "3. Align", available: false },
  { id: "edit", label: "4. Edit", available: false },
  { id: "style", label: "5. Style", available: false },
  { id: "export", label: "6. Export", available: false },
];

interface StageNavigationProps {
  readonly activeStage: WorkflowStage;
  readonly onSelect: (stage: WorkflowStage) => void;
}

export function StageNavigation({ activeStage, onSelect }: StageNavigationProps) {
  return (
    <nav className="stage-navigation" aria-label="Workflow stages">
      <ol>
        {stages.map((stage) => (
          <li key={stage.id}>
            <button
              type="button"
              className={stage.id === activeStage ? "stage-active" : undefined}
              aria-current={stage.id === activeStage ? "step" : undefined}
              disabled={!stage.available}
              title={stage.available ? stage.label : "Available after importing audio"}
              onClick={() => onSelect(stage.id)}
            >
              {stage.label}
              {!stage.available && <span className="sr-only"> — unavailable</span>}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
