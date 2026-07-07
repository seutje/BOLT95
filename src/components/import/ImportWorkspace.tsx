import { useEffect, useRef, useState } from "react";
import { AppError } from "../../app/errors/AppError";
import { useAppStore } from "../../app/state/store";
import { AlignmentFixtureViewer } from "../alignment/AlignmentFixtureViewer";
import { createCanonicalLyrics, type CanonicalLyrics } from "../../domain/lyrics/canonical";
import { parseLyrics, readLyricsFile, type ParsedLyrics } from "../../domain/lyrics/parser";
import { importAudio, releaseAudioImport } from "../../media/audio/importAudio";
import { formatDuration } from "../../media/audio/format";
import type { AudioImportResult } from "../../media/audio/types";
import { WaveformCanvas } from "./WaveformCanvas";

interface ImportWorkspaceProps {
  readonly onAudioChange: (
    summary: { name: string; durationMs: number; risk: AudioImportResult["risk"] } | null,
  ) => void;
  readonly onContinue: (audio: AudioImportResult, lyrics: CanonicalLyrics | null) => void;
}

type AudioView = Omit<AudioImportResult, "file" | "pcm"> & {
  readonly fileName: string;
  readonly fileSize: number;
};

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function presentError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError("UNEXPECTED_FAILURE", "Audio import failed unexpectedly.", {
        technicalDetail: error instanceof Error ? error.message : "unknown import failure",
        recoveryAction: "Try the import again.",
      });
}

export function ImportWorkspace({ onAudioChange, onContinue }: ImportWorkspaceProps) {
  const setCurrentJob = useAppStore((state) => state.setCurrentJob);
  const currentJob = useAppStore((state) => state.currentJob);
  const [audio, setAudio] = useState<AudioView | null>(null);
  const [lyricsText, setLyricsText] = useState("");
  const [lyrics, setLyrics] = useState<ParsedLyrics>(() => parseLyrics(""));
  const [error, setError] = useState<AppError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [highRiskAccepted, setHighRiskAccepted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<AudioImportResult | null>(null);
  const audioHandedOffRef = useRef(false);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      if (audioRef.current && !audioHandedOffRef.current) releaseAudioImport(audioRef.current);
    },
    [],
  );

  async function selectAudio(file: File | undefined) {
    if (!file) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setProcessing(true);
    setHighRiskAccepted(false);
    try {
      const result = await importAudio(file, {
        signal: controller.signal,
        onProgress: setCurrentJob,
      });
      if (audioRef.current) releaseAudioImport(audioRef.current);
      audioHandedOffRef.current = false;
      audioRef.current = result;
      const importedFile = result.file;
      setAudio({
        objectUrl: result.objectUrl,
        format: result.format,
        durationMs: result.durationMs,
        sampleRate: result.sampleRate,
        sampleCount: result.sampleCount,
        fingerprint: result.fingerprint,
        waveform: result.waveform,
        risk: result.risk,
        riskReasons: result.riskReasons,
        fileName: importedFile.name,
        fileSize: importedFile.size,
      });
      onAudioChange({ name: importedFile.name, durationMs: result.durationMs, risk: result.risk });
    } catch (cause) {
      const nextError = presentError(cause);
      if (nextError.code !== "JOB_CANCELLED") setError(nextError);
      setCurrentJob({
        id: crypto.randomUUID(),
        type: "decode",
        phase: nextError.code === "JOB_CANCELLED" ? "cancelled" : "failed",
        message: nextError.message,
      });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setProcessing(false);
    }
  }

  function updateLyrics(text: string, format?: "txt" | "lrc") {
    setLyricsText(text);
    setLyrics(parseLyrics(text, format));
  }

  async function selectLyrics(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = await readLyricsFile(file);
      setLyricsText(parsed.sourceText);
      setLyrics(parsed);
      setError(null);
    } catch (cause) {
      setError(presentError(cause));
    }
  }

  return (
    <section className="workspace-main" aria-labelledby="workspace-title">
      <div className="hero-copy compact-hero">
        <p className="eyebrow">IMPORT</p>
        <h2 id="workspace-title">Add audio and lyrics</h2>
        <p>Choose one MP3 and optionally paste lyrics or load a UTF-8 TXT/LRC file.</p>
      </div>

      <aside className="privacy-notice import-privacy" aria-label="Privacy notice">
        <span className="privacy-icon" aria-hidden="true">
          🔒
        </span>
        <div>
          <strong>Your media stays on this device.</strong>
          <p>Audio and lyrics are processed by this browser and are never uploaded.</p>
        </div>
      </aside>

      <section className="group-box import-group" aria-labelledby="audio-import-title">
        <h2 id="audio-import-title">1. Audio</h2>
        <div
          className={`drop-zone${dragging ? " drop-zone-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void selectAudio(event.dataTransfer.files[0]);
          }}
        >
          <strong>Drop an MP3 here</strong>
          <span>or</span>
          <label className="button-label" htmlFor="audio-file">
            Choose audio…
          </label>
          <input
            className="sr-only"
            id="audio-file"
            type="file"
            accept=".mp3,audio/mpeg,audio/mp3"
            disabled={processing}
            onChange={(event) => {
              void selectAudio(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <small>MP3 only · 250 MB / 90 minute hard safety limit</small>
        </div>

        {processing && (
          <div className="job-progress" role="status" aria-live="polite">
            <progress value={currentJob?.progress ?? 0} max="1" />
            <span>{currentJob?.message ?? "Preparing audio…"}</span>
            <button type="button" onClick={() => controllerRef.current?.abort()}>
              Cancel
            </button>
          </div>
        )}

        {audio && (
          <div className="audio-result">
            <dl className="file-facts">
              <div>
                <dt>File</dt>
                <dd>{audio.fileName}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{audio.format}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(audio.fileSize)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(audio.durationMs)}</dd>
              </div>
              <div>
                <dt>Analysis</dt>
                <dd>Mono · 16 kHz</dd>
              </div>
            </dl>
            <audio controls src={audio.objectUrl} aria-label={`Playback for ${audio.fileName}`} />
            <WaveformCanvas waveform={audio.waveform} />
            <p className={`risk-notice risk-${audio.risk}`}>
              <strong>
                {audio.risk[0]?.toLocaleUpperCase()}
                {audio.risk.slice(1)} processing risk.
              </strong>{" "}
              {audio.riskReasons.length
                ? audio.riskReasons.join(" and ")
                : "Within tested import thresholds."}
            </p>
            {audio.risk === "high" && (
              <label className="acknowledgement">
                <input
                  type="checkbox"
                  checked={highRiskAccepted}
                  onChange={(event) => setHighRiskAccepted(event.target.checked)}
                />
                I understand this track may use substantial memory and take a long time.
              </label>
            )}
          </div>
        )}
      </section>

      <section className="group-box import-group" aria-labelledby="lyrics-import-title">
        <h2 id="lyrics-import-title">2. Lyrics (optional)</h2>
        <label htmlFor="lyrics-text">Canonical lyrics</label>
        <textarea
          id="lyrics-text"
          rows={9}
          value={lyricsText}
          placeholder="Paste lyrics here. Blank lines and [Section] annotations are preserved."
          onChange={(event) => updateLyrics(event.target.value)}
        />
        <div className="lyrics-actions">
          <label className="button-label" htmlFor="lyrics-file">
            Load TXT/LRC…
          </label>
          <input
            className="sr-only"
            id="lyrics-file"
            type="file"
            accept=".txt,.lrc,text/plain"
            onChange={(event) => {
              void selectLyrics(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <span aria-live="polite">
            {lyricsText
              ? `${lyrics.format.toLocaleUpperCase()} · ${lyrics.lines.length} source lines · ${lyrics.metadata.length} metadata fields`
              : "No supplied lyrics"}
          </span>
        </div>
      </section>

      {error && (
        <section className="import-error" role="alert">
          <strong>{error.message}</strong>
          <span>Error code: {error.code}</span>
          {error.recoveryAction && <span>{error.recoveryAction}</span>}
        </section>
      )}

      <button
        type="button"
        disabled={!audio || (audio.risk === "high" && !highRiskAccepted)}
        onClick={() => {
          if (audioRef.current) {
            audioHandedOffRef.current = true;
            onContinue(audioRef.current, lyricsText ? createCanonicalLyrics(lyrics) : null);
          }
        }}
      >
        Continue to transcription
      </button>

      <AlignmentFixtureViewer />
    </section>
  );
}
