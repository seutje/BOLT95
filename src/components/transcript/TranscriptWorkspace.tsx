import { useEffect, useMemo, useRef, useState } from "react";
import { AppError } from "../../app/errors/AppError";
import { useAppStore } from "../../app/state/store";
import type { AudioImportResult } from "../../media/audio/types";
import { formatDuration } from "../../media/audio/format";
import {
  cacheSizeBytes,
  clearCachedModels,
  deleteCachedModel,
  listCachedModels,
} from "../../infrastructure/storage/models";
import {
  downloadRegisteredModel,
  storeUserSuppliedModel,
} from "../../media/transcription/modelDownload";
import { modelManifest, selectModelForTranscription } from "../../media/transcription/registry";
import type {
  ModelCacheEntry,
  TranscriptionLanguageMode,
  TranscriptionProgress,
  TranscriptionResult,
} from "../../media/transcription/types";
import { WhisperWorkerClient } from "../../media/transcription/workerClient";
import type { JobPhase } from "../../app/jobs/types";

interface TranscriptWorkspaceProps {
  readonly audio: AudioImportResult | null;
  readonly onTranscriptReady?: (result: TranscriptionResult) => void;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function presentError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError("UNEXPECTED_FAILURE", "Transcription failed unexpectedly.", {
        technicalDetail: error instanceof Error ? error.message : "unknown transcription failure",
        recoveryAction: "Try the operation again.",
      });
}

function jobPhaseForProgress(phase: TranscriptionProgress["phase"]): JobPhase {
  if (phase === "download") return "downloading";
  if (phase === "integrity") return "finalizing";
  return phase;
}

function deterministicE2eTranscript(audio: AudioImportResult): TranscriptionResult {
  const entries = [
    { text: "First", normalized: ["first"], confidence: 0.98 },
    { text: "line", normalized: ["line"], confidence: 0.98 },
    { text: "Café", normalized: ["cafe"], confidence: 0.98 },
    { text: "déjà", normalized: ["deja"], confidence: 0.96 },
    { text: "vu", normalized: ["vu"], confidence: 0.96 },
    { text: "Hello", normalized: ["hello"], confidence: 0.95 },
    { text: "world", normalized: ["world"], confidence: 0.95 },
    { text: "Again", normalized: ["again"], confidence: 0.82 },
  ] as const;
  const slot = Math.max(90, Math.floor(audio.durationMs / (entries.length + 1)));
  const words = entries.map((entry, index) => {
    const startMs = Math.min(audio.durationMs, index * slot);
    const endMs = Math.min(audio.durationMs, Math.max(startMs, startMs + Math.floor(slot * 0.72)));
    return {
      id: `e2e-${index + 1}`,
      text: entry.text,
      normalized: [...entry.normalized],
      startMs,
      endMs,
      confidence: entry.confidence,
    };
  });
  return {
    schemaVersion: 1,
    durationMs: audio.durationMs,
    language: "en",
    modelId: "e2e-deterministic",
    raw: {
      languageId: 0,
      detectedLanguage: "en",
      wasmHeapBytes: 0,
      peakPcmBytes: 0,
      segments: [
        {
          text: "First line Café déjà vu Hello world Again",
          startMs: 0,
          endMs: audio.durationMs,
          tokens: words.map((word) => ({
            text: word.text,
            startMs: word.startMs,
            endMs: word.endMs,
            probability: word.confidence,
          })),
        },
      ],
    },
    words,
  };
}

export function TranscriptWorkspace({ audio, onTranscriptReady }: TranscriptWorkspaceProps) {
  const setCurrentJob = useAppStore((state) => state.setCurrentJob);
  const [languageMode, setLanguageMode] = useState<TranscriptionLanguageMode>("auto");
  const [modelId, setModelId] = useState("tiny-multilingual-q5_1");
  const [cacheEntries, setCacheEntries] = useState<readonly ModelCacheEntry[]>([]);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const clientRef = useRef<WhisperWorkerClient | null>(null);

  const choice = useMemo(
    () =>
      selectModelForTranscription({
        languageMode,
        audioRisk: audio?.risk ?? "low",
        requestedModelId: modelId,
      }),
    [audio?.risk, languageMode, modelId],
  );
  const cached = cacheEntries.some((entry) => entry.id === choice.model.id);
  const cacheBytes = cacheSizeBytes(cacheEntries);

  useEffect(() => {
    void refreshCache();
    return () => {
      controllerRef.current?.abort();
      clientRef.current?.dispose();
    };
  }, []);

  async function refreshCache(): Promise<void> {
    try {
      setCacheEntries(await listCachedModels());
    } catch {
      setCacheEntries([]);
    }
  }

  function updateProgress(next: TranscriptionProgress): void {
    setProgress(next);
    const progressValue =
      next.loadedBytes && next.totalBytes ? next.loadedBytes / next.totalBytes : undefined;
    setCurrentJob({
      id: "transcription",
      type: "transcribe",
      phase: jobPhaseForProgress(next.phase),
      message: next.message,
      ...(progressValue === undefined ? {} : { progress: progressValue }),
    });
  }

  async function runBusy(operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      await operation(controller.signal);
    } catch (cause) {
      const nextError = presentError(cause);
      if (nextError.code !== "JOB_CANCELLED") setError(nextError);
      setCurrentJob({
        id: crypto.randomUUID(),
        type: "transcribe",
        phase: nextError.code === "JOB_CANCELLED" ? "cancelled" : "failed",
        message: nextError.message,
      });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy(false);
      setProgress(null);
      await refreshCache();
    }
  }

  async function downloadModel(): Promise<void> {
    await runBusy(async (signal) => {
      await downloadRegisteredModel({ model: choice.model, signal, onProgress: updateProgress });
      setCurrentJob({
        id: crypto.randomUUID(),
        type: "transcribe",
        phase: "completed",
        message: "Model cached locally.",
      });
    });
  }

  async function supplyModel(file: File | undefined): Promise<void> {
    if (!file) return;
    await runBusy(async () => {
      updateProgress({ phase: "integrity", message: "Checking supplied model..." });
      await storeUserSuppliedModel({ model: choice.model, file });
      setCurrentJob({
        id: crypto.randomUUID(),
        type: "transcribe",
        phase: "completed",
        message: "Supplied model cached locally.",
      });
    });
  }

  async function transcribe(): Promise<void> {
    if (!audio) return;
    await runBusy(async (signal) => {
      updateProgress({ phase: "loading", message: "Preparing local transcription..." });
      const client = new WhisperWorkerClient();
      clientRef.current = client;
      const transcript = await client.transcribe({
        model: choice.model,
        pcm: audio.pcm.slice(),
        durationMs: audio.durationMs,
        language: languageMode === "auto" ? "auto" : languageMode,
        signal,
        onProgress: updateProgress,
      });
      setResult(transcript);
      onTranscriptReady?.(transcript);
      setCurrentJob({
        id: crypto.randomUUID(),
        type: "transcribe",
        phase: "completed",
        message: "Transcript created locally.",
      });
    });
  }

  function useDeterministicTranscript(): void {
    if (!audio) return;
    const transcript = deterministicE2eTranscript(audio);
    setResult(transcript);
    onTranscriptReady?.(transcript);
  }

  return (
    <section className="workspace-main" aria-labelledby="transcript-title">
      <div className="hero-copy compact-hero">
        <p className="eyebrow">TRANSCRIBE</p>
        <h2 id="transcript-title">Local Whisper transcription</h2>
        <p>Choose a model, cache it locally, then transcribe the imported PCM in a worker.</p>
      </div>

      {!audio && (
        <section className="group-box import-group" aria-labelledby="missing-audio-title">
          <h2 id="missing-audio-title">Audio required</h2>
          <p>Import an MP3 before starting transcription.</p>
        </section>
      )}

      {audio && (
        <>
          <section className="group-box import-group" aria-labelledby="model-title">
            <h2 id="model-title">1. Model</h2>
            <dl className="file-facts">
              <div>
                <dt>Track</dt>
                <dd>{formatDuration(audio.durationMs)}</dd>
              </div>
              <div>
                <dt>Risk</dt>
                <dd>{audio.risk}</dd>
              </div>
              <div>
                <dt>Cache</dt>
                <dd>
                  {cacheEntries.length} model{cacheEntries.length === 1 ? "" : "s"} ·{" "}
                  {formatBytes(cacheBytes)}
                </dd>
              </div>
            </dl>

            <label htmlFor="language-mode">Language</label>
            <select
              id="language-mode"
              value={languageMode}
              disabled={busy}
              onChange={(event) => setLanguageMode(event.target.value as TranscriptionLanguageMode)}
            >
              <option value="auto">Auto detect</option>
              <option value="en">English</option>
              <option value="multilingual">Multilingual</option>
            </select>

            <label htmlFor="model-choice">Model</label>
            <select
              id="model-choice"
              value={choice.model.id}
              disabled={busy}
              onChange={(event) => setModelId(event.target.value)}
            >
              {modelManifest.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName} · {formatBytes(model.sizeBytes)}
                </option>
              ))}
            </select>
            <p>{choice.reason}</p>

            <div className="lyrics-actions">
              <button type="button" disabled={busy || cached} onClick={() => void downloadModel()}>
                Download model
              </button>
              <label className="button-label" htmlFor="model-file">
                Supply GGML…
              </label>
              <input
                className="sr-only"
                id="model-file"
                type="file"
                accept=".bin,application/octet-stream"
                disabled={busy}
                onChange={(event) => {
                  void supplyModel(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy || !cached}
                onClick={() => {
                  void deleteCachedModel(choice.model.id).then(refreshCache);
                }}
              >
                Clear selected
              </button>
              <button
                type="button"
                disabled={busy || cacheEntries.length === 0}
                onClick={() => {
                  void clearCachedModels().then(refreshCache);
                }}
              >
                Clear all
              </button>
            </div>
          </section>

          <section className="group-box import-group" aria-labelledby="run-title">
            <h2 id="run-title">2. Transcription</h2>
            {progress && (
              <div className="job-progress" role="status" aria-live="polite">
                <progress value={progress.loadedBytes ?? 0} max={progress.totalBytes ?? 1} />
                <span>{progress.message}</span>
                <button type="button" onClick={() => controllerRef.current?.abort()}>
                  Cancel
                </button>
              </div>
            )}
            <button type="button" disabled={busy || !cached} onClick={() => void transcribe()}>
              Transcribe locally
            </button>
            {import.meta.env.VITE_BOLT95_E2E === "1" && (
              <button type="button" disabled={busy} onClick={useDeterministicTranscript}>
                Use deterministic transcript
              </button>
            )}
          </section>
        </>
      )}

      {error && (
        <section className="import-error" role="alert">
          <strong>{error.message}</strong>
          <span>Error code: {error.code}</span>
          {error.recoveryAction && <span>{error.recoveryAction}</span>}
        </section>
      )}

      {result && (
        <section
          className="group-box import-group transcript-result"
          aria-labelledby="result-title"
        >
          <h2 id="result-title">Transcript</h2>
          <p>
            {result.words.length} words · language {result.language ?? "unknown"} · model{" "}
            {result.modelId}
          </p>
          <ol>
            {result.words.slice(0, 80).map((word) => (
              <li key={word.id}>
                <span>{word.text}</span>
                <small>
                  {word.startMs}–{word.endMs} ms
                </small>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => onTranscriptReady?.(result)}>
            Continue to alignment
          </button>
        </section>
      )}
    </section>
  );
}
