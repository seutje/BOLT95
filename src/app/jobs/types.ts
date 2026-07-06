import type { SerializedAppError } from "../errors/AppError";

export type JobPhase =
  | "idle"
  | "preparing"
  | "downloading"
  | "loading"
  | "processing"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export interface BackgroundJobState {
  readonly id: string;
  readonly type: "decode" | "transcribe" | "align" | "render" | "encode";
  readonly phase: JobPhase;
  readonly progress?: number;
  readonly message?: string;
  readonly error?: SerializedAppError;
}
