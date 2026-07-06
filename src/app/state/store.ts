import { create } from "zustand";
import type { BackgroundJobState } from "../jobs/types";

export type WorkflowStage = "import" | "transcribe" | "align" | "edit" | "style" | "export";

export type AppDialog = "capabilities" | "privacy" | "diagnostics" | null;

interface AppState {
  readonly activeStage: WorkflowStage;
  readonly openDialog: AppDialog;
  readonly currentJob: BackgroundJobState | null;
  setActiveStage(stage: WorkflowStage): void;
  showDialog(dialog: Exclude<AppDialog, null>): void;
  closeDialog(): void;
  setCurrentJob(job: BackgroundJobState | null): void;
}

export const useAppStore = create<AppState>((set) => ({
  activeStage: "import",
  openDialog: null,
  currentJob: null,
  setActiveStage: (activeStage) => set({ activeStage }),
  showDialog: (openDialog) => set({ openDialog }),
  closeDialog: () => set({ openDialog: null }),
  setCurrentJob: (currentJob) => set({ currentJob }),
}));
