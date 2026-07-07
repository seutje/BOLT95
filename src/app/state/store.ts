import { create } from "zustand";
import type { AlignmentResult } from "../../domain/alignment/engine";
import type { CanonicalLyrics } from "../../domain/lyrics/canonical";
import type { TranscriptionResult } from "../../media/transcription/types";
import type { BackgroundJobState } from "../jobs/types";

export type WorkflowStage =
  "import" | "transcribe" | "align" | "review" | "edit" | "style" | "export";

export type AppDialog = "capabilities" | "privacy" | "diagnostics" | null;

interface AppState {
  readonly activeStage: WorkflowStage;
  readonly openDialog: AppDialog;
  readonly currentJob: BackgroundJobState | null;
  readonly suppliedLyrics: CanonicalLyrics | null;
  readonly transcript: TranscriptionResult | null;
  readonly alignment: AlignmentResult | null;
  setActiveStage(stage: WorkflowStage): void;
  showDialog(dialog: Exclude<AppDialog, null>): void;
  closeDialog(): void;
  setCurrentJob(job: BackgroundJobState | null): void;
  setSuppliedLyrics(lyrics: CanonicalLyrics | null): void;
  setTranscript(transcript: TranscriptionResult | null): void;
  setAlignment(alignment: AlignmentResult | null): void;
}

export const useAppStore = create<AppState>((set) => ({
  activeStage: "import",
  openDialog: null,
  currentJob: null,
  suppliedLyrics: null,
  transcript: null,
  alignment: null,
  setActiveStage: (activeStage) => set({ activeStage }),
  showDialog: (openDialog) => set({ openDialog }),
  closeDialog: () => set({ openDialog: null }),
  setCurrentJob: (currentJob) => set({ currentJob }),
  setSuppliedLyrics: (suppliedLyrics) => set({ suppliedLyrics }),
  setTranscript: (transcript) => set({ transcript }),
  setAlignment: (alignment) => set({ alignment }),
}));
