import type { WorkflowStage } from "../../app/state/store";

interface StageDefinition {
  readonly id: WorkflowStage;
  readonly label: string;
}

const stages: readonly StageDefinition[] = [
  { id: "import", label: "1. Import" },
  { id: "transcribe", label: "2. Transcribe" },
  { id: "align", label: "3. Align" },
  { id: "edit", label: "4. Edit" },
  { id: "style", label: "5. Style" },
  { id: "export", label: "6. Export" },
];

interface StageNavigationProps {
  readonly activeStage: WorkflowStage;
  readonly availableStages?: readonly WorkflowStage[];
  readonly onSelect: (stage: WorkflowStage) => void;
}

export function StageNavigation({
  activeStage,
  availableStages = ["import"],
  onSelect,
}: StageNavigationProps) {
  return (
    <nav className="stage-navigation" aria-label="Workflow stages">
      <ol>
        {stages.map((stage) => {
          const available = availableStages.includes(stage.id);
          return (
            <li key={stage.id}>
              <button
                type="button"
                className={stage.id === activeStage ? "stage-active" : undefined}
                aria-current={stage.id === activeStage ? "step" : undefined}
                disabled={!available}
                title={available ? stage.label : "Available after completing earlier stages"}
                onClick={() => onSelect(stage.id)}
              >
                {stage.label}
                {!available && <span className="sr-only"> — unavailable</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
