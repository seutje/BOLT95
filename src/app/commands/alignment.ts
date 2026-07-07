import type {
  AlignmentOptions,
  AlignmentResult,
  TranscriptResult,
} from "../../domain/alignment/engine";
import { createCanonicalLyrics } from "../../domain/lyrics/canonical";
import type { CanonicalLyrics } from "../../domain/lyrics/canonical";
import { parseLyrics } from "../../domain/lyrics/parser";
import type { AlignmentWorkerRequest, AlignmentWorkerResponse } from "../../workers/protocol";
import { AppError } from "../errors/AppError";

export function canonicalLyricsFromTranscript(transcript: TranscriptResult): CanonicalLyrics {
  const lineTexts: string[] = [];
  let current: string[] = [];
  let previousEnd = 0;

  for (const word of transcript.words) {
    const gap = word.startMs - previousEnd;
    if (current.length > 0 && (gap >= 1_200 || current.length >= 8)) {
      lineTexts.push(current.join(" "));
      current = [];
    }
    current.push(word.text);
    previousEnd = word.endMs;
  }
  if (current.length > 0) lineTexts.push(current.join(" "));

  const sourceText = lineTexts.length > 0 ? lineTexts.join("\n") : "";
  return createCanonicalLyrics(parseLyrics(sourceText, "txt"));
}

export function alignmentProjectFromResult(result: AlignmentResult) {
  return {
    schemaVersion: 1 as const,
    canonical: result.canonical,
    transcript: result.transcript,
    words: result.words,
    lines: result.lines,
    manualLineTimings: result.lines
      .filter(
        (line) =>
          line.provenance === "manual" && line.startMs !== undefined && line.endMs !== undefined,
      )
      .map((line) => ({
        lineId: line.lineId,
        startMs: line.startMs!,
        endMs: line.endMs!,
      })),
  };
}

function deserializeFailure(
  message: Extract<AlignmentWorkerResponse, { type: "alignment/failure" }>,
): AppError {
  return new AppError(message.error.code, message.error.message, {
    ...(message.error.technicalDetail ? { technicalDetail: message.error.technicalDetail } : {}),
    ...(message.error.recoveryAction ? { recoveryAction: message.error.recoveryAction } : {}),
  });
}

export class AlignmentWorkerClient {
  private worker: Worker | null = null;

  align(options: {
    readonly canonical: CanonicalLyrics;
    readonly transcript: TranscriptResult;
    readonly signal: AbortSignal;
    readonly alignmentOptions?: AlignmentOptions;
    readonly onProgress?: (message: string) => void;
  }): Promise<AlignmentResult> {
    this.dispose();
    this.worker = new Worker(new URL("../../workers/alignment.worker.ts", import.meta.url), {
      type: "module",
    });
    const request: AlignmentWorkerRequest = {
      type: "alignment/run",
      requestId: crypto.randomUUID(),
      canonical: options.canonical,
      transcript: options.transcript,
      ...(options.alignmentOptions ? { options: options.alignmentOptions } : {}),
    };
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      const cleanup = (): void => {
        worker?.removeEventListener("message", listener);
        worker?.removeEventListener("error", fail);
        options.signal.removeEventListener("abort", abort);
        this.dispose();
      };
      const abort = (): void => {
        cleanup();
        reject(
          new AppError("JOB_CANCELLED", "Alignment was cancelled.", {
            recoveryAction: "Retry alignment when ready.",
          }),
        );
      };
      const fail = (): void => {
        cleanup();
        reject(
          new AppError("WORKER_FAILED", "Alignment worker failed.", {
            recoveryAction: "Retry alignment. Your last valid project was kept.",
          }),
        );
      };
      const listener = (event: MessageEvent<AlignmentWorkerResponse>): void => {
        const message = event.data;
        if (message.requestId !== request.requestId) return;
        if (message.type === "alignment/progress") {
          options.onProgress?.(message.message);
          return;
        }
        if (message.type === "alignment/failure") {
          cleanup();
          reject(deserializeFailure(message));
          return;
        }
        cleanup();
        resolve(message.result);
      };
      if (options.signal.aborted) {
        abort();
        return;
      }
      worker?.addEventListener("message", listener);
      worker?.addEventListener("error", fail, { once: true });
      options.signal.addEventListener("abort", abort, { once: true });
      worker?.postMessage(request);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
