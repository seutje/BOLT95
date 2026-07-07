import type { WorkflowStage } from "../state/store";

export interface WorkflowSnapshot {
  readonly hasAudio: boolean;
  readonly hasTranscript: boolean;
  readonly hasAlignment: boolean;
  readonly hasEditorProject?: boolean;
}

const stageOrder: readonly WorkflowStage[] = [
  "import",
  "transcribe",
  "align",
  "review",
  "edit",
  "style",
  "export",
];

export function availableWorkflowStages(snapshot: WorkflowSnapshot): readonly WorkflowStage[] {
  const available: WorkflowStage[] = ["import"];
  if (snapshot.hasAudio) available.push("transcribe");
  if (snapshot.hasTranscript) available.push("align");
  if (snapshot.hasAlignment) available.push("review", "edit");
  if (snapshot.hasEditorProject) available.push("export");
  return available;
}

export function canEnterWorkflowStage(stage: WorkflowStage, snapshot: WorkflowSnapshot): boolean {
  return availableWorkflowStages(snapshot).includes(stage);
}

export function nextWorkflowStage(stage: WorkflowStage, snapshot: WorkflowSnapshot): WorkflowStage {
  const available = availableWorkflowStages(snapshot);
  const currentIndex = stageOrder.indexOf(stage);
  return (
    stageOrder.find((candidate, index) => index > currentIndex && available.includes(candidate)) ??
    stage
  );
}
