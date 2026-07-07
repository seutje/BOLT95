import { useEffect, useMemo, useRef, useState } from "react";
import { AlignmentWorkerClient, canonicalLyricsFromTranscript } from "../../app/commands/alignment";
import { AppError } from "../../app/errors/AppError";
import { useAppStore } from "../../app/state/store";
import { lineReviewLabel, type AlignmentResult } from "../../domain/alignment/engine";
import {
  createCanonicalLyrics,
  reconstructCanonicalSource,
  type CanonicalLyrics,
} from "../../domain/lyrics/canonical";
import { parseLyrics } from "../../domain/lyrics/parser";
import type { TranscriptionResult } from "../../media/transcription/types";

interface AlignmentReviewWorkspaceProps {
  readonly suppliedLyrics: CanonicalLyrics | null;
  readonly transcript: TranscriptionResult | null;
  readonly alignment: AlignmentResult | null;
  readonly onAlignmentReady: (alignment: AlignmentResult) => void;
}

function presentError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError("UNEXPECTED_FAILURE", "Alignment failed unexpectedly.", {
        technicalDetail: error instanceof Error ? error.message : "unknown alignment failure",
        recoveryAction: "Retry alignment. The last valid project was kept.",
      });
}

function confidenceLabel(line: AlignmentResult["lines"][number]): string {
  if (line.reviewState === "unresolved") return "Unresolved";
  if (line.reviewState === "ambiguous") return "Ambiguous";
  if (line.confidence < 0.55) return "Low confidence";
  return "Accepted";
}

function safeTime(startMs: number | undefined, endMs: number | undefined): string {
  if (startMs === undefined || endMs === undefined) return "No timing";
  return `${startMs}–${endMs} ms`;
}

export function AlignmentReviewWorkspace({
  suppliedLyrics,
  transcript,
  alignment,
  onAlignmentReady,
}: AlignmentReviewWorkspaceProps) {
  const setCurrentJob = useAppStore((state) => state.setCurrentJob);
  const setActiveStage = useAppStore((state) => state.setActiveStage);
  const noLyricsSeed = useMemo(
    () => (transcript ? canonicalLyricsFromTranscript(transcript).sourceText : ""),
    [transcript],
  );
  const [draftLyrics, setDraftLyrics] = useState(() => (suppliedLyrics ? "" : noLyricsSeed));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const clientRef = useRef<AlignmentWorkerClient | null>(null);
  const lineRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      clientRef.current?.dispose();
    },
    [],
  );

  const canonical = useMemo(() => {
    if (suppliedLyrics) return suppliedLyrics;
    return createCanonicalLyrics(parseLyrics(draftLyrics, "txt"));
  }, [draftLyrics, suppliedLyrics]);

  async function runAlignment(selectedLineId?: string): Promise<void> {
    if (!transcript) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    const client = new AlignmentWorkerClient();
    controllerRef.current = controller;
    clientRef.current = client;
    setBusy(true);
    setError(null);
    setProgress("Preparing alignment...");
    setCurrentJob({
      id: crypto.randomUUID(),
      type: "align",
      phase: "processing",
      message: selectedLineId
        ? "Re-aligning selected lyric region..."
        : "Aligning transcript evidence...",
    });
    try {
      const manualLineTimings =
        selectedLineId && alignment
          ? alignment.lines
              .filter(
                (line) =>
                  line.lineId !== selectedLineId &&
                  line.provenance === "manual" &&
                  line.startMs !== undefined &&
                  line.endMs !== undefined,
              )
              .map((line) => ({
                lineId: line.lineId,
                startMs: line.startMs!,
                endMs: line.endMs!,
              }))
          : [];
      const result = await client.align({
        canonical,
        transcript,
        signal: controller.signal,
        alignmentOptions: { manualLineTimings },
        onProgress: (message) => {
          setProgress(message);
          setCurrentJob({
            id: "alignment",
            type: "align",
            phase: "processing",
            message,
          });
        },
      });
      onAlignmentReady(result);
      setActiveStage("review");
      setCurrentJob({
        id: crypto.randomUUID(),
        type: "align",
        phase: "completed",
        message: "Timed lines are ready for review.",
      });
    } catch (cause) {
      const nextError = presentError(cause);
      if (nextError.code !== "JOB_CANCELLED") setError(nextError);
      setCurrentJob({
        id: crypto.randomUUID(),
        type: "align",
        phase: nextError.code === "JOB_CANCELLED" ? "cancelled" : "failed",
        message: nextError.message,
      });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (clientRef.current === client) clientRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  }

  function focusNextLowConfidence(): void {
    const target = alignment?.lines.find(
      (line) => line.reviewState !== "accepted" || line.confidence < 0.55,
    );
    if (target) lineRefs.current.get(target.lineId)?.focus();
  }

  const reviewWarningCount = alignment
    ? alignment.lines.filter((line) => line.reviewState !== "accepted").length
    : 0;

  return (
    <section className="workspace-main" aria-labelledby="review-title">
      <div className="hero-copy compact-hero">
        <p className="eyebrow">ALIGN + REVIEW</p>
        <h2 id="review-title">Review timed lyric lines</h2>
        <p>
          Build timed lines from the local transcript while keeping canonical lyric text separate.
        </p>
      </div>

      {!transcript && (
        <section className="group-box import-group" aria-labelledby="missing-transcript-title">
          <h2 id="missing-transcript-title">Transcript required</h2>
          <p>Complete transcription before alignment.</p>
        </section>
      )}

      {transcript && (
        <section className="group-box import-group" aria-labelledby="canonical-title">
          <h2 id="canonical-title">Canonical text</h2>
          {suppliedLyrics ? (
            <>
              <p>Supplied lyrics are locked as canonical text. Whisper is used only for timing.</p>
              <pre className="canonical-preview">{reconstructCanonicalSource(suppliedLyrics)}</pre>
            </>
          ) : (
            <>
              <label htmlFor="transcript-lines">Editable transcript lines</label>
              <textarea
                id="transcript-lines"
                rows={8}
                value={draftLyrics}
                disabled={busy}
                onChange={(event) => setDraftLyrics(event.target.value)}
              />
            </>
          )}
          <div className="lyrics-actions">
            <button
              type="button"
              disabled={busy || canonical.tokens.length === 0}
              onClick={() => void runAlignment()}
            >
              {alignment ? "Retry alignment" : "Align lines"}
            </button>
            {busy && (
              <button type="button" onClick={() => controllerRef.current?.abort()}>
                Cancel
              </button>
            )}
            <span role="status" aria-live="polite">
              {progress ?? `${transcript.words.length} transcript words available`}
            </span>
          </div>
        </section>
      )}

      {error && (
        <section className="import-error" role="alert">
          <strong>{error.message}</strong>
          <span>Error code: {error.code}</span>
          {error.recoveryAction && <span>{error.recoveryAction}</span>}
        </section>
      )}

      {alignment && (
        <section
          className="group-box import-group review-results"
          aria-labelledby="timed-lines-title"
        >
          <h2 id="timed-lines-title">Timed lines</h2>
          <div className="review-toolbar">
            <button type="button" onClick={focusNextLowConfidence}>
              Next low-confidence line
            </button>
            <span>{reviewWarningCount} lines need review</span>
            <span>
              {alignment.issues.length || reviewWarningCount
                ? "Unresolved export warnings are present."
                : "No unresolved export warnings."}
            </span>
          </div>
          {alignment.issues.length > 0 && (
            <ul className="alignment-issues" aria-label="Unresolved export warnings">
              {alignment.issues.map((issue) => (
                <li key={`${issue.code}-${issue.lineIds.join("-")}`}>{issue.message}</li>
              ))}
            </ul>
          )}
          <div className="alignment-table-wrap">
            <table className="alignment-table">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Timing</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {alignment.lines.map((line) => (
                  <tr
                    key={line.lineId}
                    ref={(node) => {
                      if (node) lineRefs.current.set(line.lineId, node);
                      else lineRefs.current.delete(line.lineId);
                    }}
                    tabIndex={0}
                    className={line.reviewState !== "accepted" ? "alignment-ambiguous" : undefined}
                  >
                    <td>{line.displayText}</td>
                    <td>{safeTime(line.startMs, line.endMs)}</td>
                    <td>
                      {confidenceLabel(line)} · {lineReviewLabel(line.reviewState)} ·{" "}
                      {Math.round(line.confidence * 100)}%
                    </td>
                    <td>{line.provenance}</td>
                    <td>
                      {line.warnings.length ? line.warnings.join(" ") : "None"}
                      {line.provenance === "manual" && (
                        <button type="button" onClick={() => void runAlignment(line.lineId)}>
                          Re-align selected
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
