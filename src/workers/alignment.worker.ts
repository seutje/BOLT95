import { AppError, serializeAppError } from "../app/errors/AppError";
import { alignCanonicalLyrics } from "../domain/alignment/engine";
import type { AlignmentWorkerRequest, AlignmentWorkerResponse } from "./protocol";

function post(message: AlignmentWorkerResponse): void {
  self.postMessage(message);
}

self.addEventListener("message", (event: MessageEvent<AlignmentWorkerRequest>) => {
  const request = event.data;
  try {
    post({
      type: "alignment/progress",
      requestId: request.requestId,
      message: "Matching transcript evidence to lyric lines...",
    });
    const result = alignCanonicalLyrics(request.canonical, request.transcript, request.options);
    post({ type: "alignment/result", requestId: request.requestId, result });
  } catch (cause) {
    const error =
      cause instanceof AppError
        ? cause
        : new AppError("WORKER_FAILED", "Alignment failed.", {
            technicalDetail: cause instanceof Error ? cause.message : "unknown alignment failure",
            recoveryAction: "Retry alignment. Your last valid project was kept.",
          });
    post({
      type: "alignment/failure",
      requestId: request.requestId,
      error: serializeAppError(error),
    });
  }
});
