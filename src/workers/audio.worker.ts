/// <reference lib="webworker" />

import { AppError, serializeAppError } from "../app/errors/AppError";
import { processAudioRequest } from "./audioProcessor";
import type { AudioWorkerRequest, AudioWorkerResponse } from "./protocol";

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<AudioWorkerRequest>) => {
  const request = event.data;
  void processAudioRequest(request, (progress, message) => {
    worker.postMessage({
      type: "audio/progress",
      jobId: request.jobId,
      progress,
      message,
    } satisfies AudioWorkerResponse);
  })
    .then((response) => {
      worker.postMessage(response, [
        response.pcm,
        response.waveform.min,
        response.waveform.max,
        response.waveform.rms,
      ]);
    })
    .catch((cause: unknown) => {
      const error =
        cause instanceof AppError
          ? cause
          : new AppError("UNEXPECTED_FAILURE", "Audio analysis failed.", {
              technicalDetail: cause instanceof Error ? cause.message : "unknown worker failure",
              recoveryAction: "Try the import again or choose a smaller MP3.",
              cause,
            });
      worker.postMessage({
        type: "audio/failure",
        jobId: request.jobId,
        error: serializeAppError(error),
      } satisfies AudioWorkerResponse);
    });
});
