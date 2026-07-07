import { useEffect, useMemo, useRef, useState } from "react";
import { saveProject } from "../../infrastructure/storage/projects";
import { fingerprintBytes } from "../../media/audio/fingerprint";
import { PreviewCanvas } from "../preview/PreviewCanvas";
import type { EditorProject } from "../../domain/project/schema";
import { renderPresets } from "../../domain/rendering/presets";
import {
  defaultVisualTheme,
  type RenderPreset,
  type VisualTheme,
  withDefaultVisualTheme,
} from "../../domain/rendering/schema";
import { AudioPlaybackClock } from "../../media/audio/playback";
import type { AudioImportResult } from "../../media/audio/types";

interface StyleWorkspaceProps {
  readonly audio: AudioImportResult | null;
  readonly project: EditorProject | null;
  readonly onProjectChange: (project: EditorProject) => void;
}

const fontOptions: readonly { readonly id: VisualTheme["fontFamily"]; readonly label: string }[] = [
  { id: "system", label: "System" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

function reduceMotionPreferred(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function msToSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function clampMs(value: number, durationMs: number): number {
  return Math.max(0, Math.min(durationMs, Math.round(value)));
}

export function StyleWorkspace({ audio, project, onProjectChange }: StyleWorkspaceProps) {
  const theme = withDefaultVisualTheme(project?.visual);
  const [previewTimeMs, setPreviewTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [drawSafeArea, setDrawSafeArea] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(reduceMotionPreferred);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | undefined>();
  const [status, setStatus] = useState("Preview ready.");
  const clockRef = useRef<AudioPlaybackClock | null>(null);
  const activeLine = useMemo(() => {
    if (!project) return null;
    return (
      project.lines.find((line) => previewTimeMs >= line.startMs && previewTimeMs < line.endMs) ??
      null
    );
  }, [previewTimeMs, project]);

  useEffect(() => {
    if (!audio) return undefined;
    const clock = new AudioPlaybackClock(audio.objectUrl);
    clockRef.current = clock;
    const tick = window.setInterval(() => {
      const snapshot = clock.snapshot;
      setPlaying(snapshot.playing);
      setPreviewTimeMs(clampMs(snapshot.currentTimeMs, audio.durationMs));
    }, 60);
    return () => {
      window.clearInterval(tick);
      clock.dispose();
      if (clockRef.current === clock) clockRef.current = null;
      setPlaying(false);
    };
  }, [audio]);

  useEffect(() => {
    if (!backgroundUrl) return undefined;
    const image = new Image();
    image.onload = () => setBackgroundImage(image);
    image.src = backgroundUrl;
    return () => {
      image.onload = null;
      setBackgroundImage(undefined);
    };
  }, [backgroundUrl]);

  useEffect(
    () => () => {
      if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
    },
    [backgroundUrl],
  );

  useEffect(() => {
    if (!project) return undefined;
    const timeout = window.setTimeout(() => {
      void saveProject(project).catch(() =>
        setStatus("Style autosave failed. Export project JSON for a manual backup."),
      );
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [project]);

  function seekPreview(ms: number): void {
    if (!project) return;
    const nextMs = clampMs(ms, project.audio.durationMs);
    clockRef.current?.seek(nextMs);
    setPreviewTimeMs(nextMs);
  }

  async function togglePlayback(): Promise<void> {
    if (!audio || !clockRef.current) {
      setStatus("Relink audio in the editor to preview playback.");
      return;
    }
    try {
      if (playing) {
        clockRef.current.pause();
        setPlaying(false);
        setStatus("Preview paused.");
      } else {
        clockRef.current.seek(previewTimeMs);
        await clockRef.current.play();
        setPlaying(true);
        setStatus("Preview playing.");
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Playback failed: ${error.message}`
          : "Playback failed. Relink the audio and try again.",
      );
    }
  }

  if (!project) {
    return (
      <section className="workspace-main" aria-labelledby="style-title">
        <div className="hero-copy compact-hero">
          <p className="eyebrow">STYLE</p>
          <h2 id="style-title">Video preview</h2>
          <p>Complete the timeline editor before styling the lyric preview.</p>
        </div>
      </section>
    );
  }

  function updateTheme(patch: Partial<VisualTheme>): void {
    if (!project) return;
    const next = {
      ...project,
      updatedAt: Date.now(),
      visual: { ...theme, ...patch },
    };
    onProjectChange(next);
    setStatus("Style updated.");
  }

  async function chooseBackground(file: File): Promise<void> {
    const oldUrl = backgroundUrl;
    const nextUrl = URL.createObjectURL(file);
    setBackgroundUrl(nextUrl);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    setBackgroundImage(undefined);
    const fingerprint = await fingerprintBytes(await file.arrayBuffer());
    updateTheme({
      backgroundImage: {
        fileName: file.name,
        fileSize: file.size,
        fingerprint,
      },
    });
    setStatus("Background linked for this session. Project JSON stores metadata only.");
  }

  function clearBackground(): void {
    if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
    setBackgroundUrl(null);
    setBackgroundImage(undefined);
    updateTheme({ backgroundImage: undefined });
    setStatus("Background cleared.");
  }

  return (
    <section className="workspace-main style-workspace" aria-labelledby="style-title">
      <div className="hero-copy compact-hero">
        <p className="eyebrow">STYLE</p>
        <h2 id="style-title">Deterministic preview</h2>
        <p>
          {activeLine
            ? `Previewing: ${activeLine.text}`
            : "Choose a timestamp to inspect current, previous, and next lyric lines."}
        </p>
      </div>

      <div className="style-layout">
        <section
          className="group-box import-group style-preview-group"
          aria-labelledby="preview-title"
        >
          <h2 id="preview-title">Preview</h2>
          <div className="preview-stage">
            <PreviewCanvas
              project={project}
              theme={theme}
              timeMs={previewTimeMs}
              backgroundImage={backgroundImage}
              drawSafeArea={drawSafeArea}
              reducedMotion={reducedMotion}
            />
          </div>
          <div className="timeline-toolbar preview-toolbar">
            <button type="button" disabled={!audio} onClick={() => void togglePlayback()}>
              {playing ? "Pause" : "Play"}
            </button>
            <label>
              Current time
              <input
                aria-label="Current time"
                type="number"
                step="0.001"
                value={msToSeconds(previewTimeMs)}
                onInput={(event) => seekPreview(Number(event.currentTarget.value) * 1000)}
                onChange={(event) => seekPreview(Number(event.currentTarget.value) * 1000)}
              />
            </label>
            <label>
              Time
              <input
                aria-label="Preview time"
                type="range"
                min="0"
                max={project.audio.durationMs}
                step="10"
                value={previewTimeMs}
                onInput={(event) => seekPreview(Number(event.currentTarget.value))}
                onChange={(event) => seekPreview(Number(event.currentTarget.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={drawSafeArea}
                onChange={(event) => setDrawSafeArea(event.currentTarget.checked)}
              />
              Safe area
            </label>
            <label>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.currentTarget.checked)}
              />
              Reduced motion
            </label>
          </div>
          <p role="status" aria-live="polite">
            {status}
          </p>
        </section>

        <section
          className="group-box import-group style-controls"
          aria-labelledby="style-controls-title"
        >
          <h2 id="style-controls-title">Controls</h2>
          <label>
            Preset
            <select
              aria-label="Preset"
              value={theme.preset}
              onChange={(event) =>
                updateTheme({ preset: event.currentTarget.value as RenderPreset })
              }
            >
              {renderPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Font
            <select
              aria-label="Font"
              value={theme.fontFamily}
              onChange={(event) =>
                updateTheme({ fontFamily: event.currentTarget.value as VisualTheme["fontFamily"] })
              }
            >
              {fontOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Font size
            <input
              aria-label="Font size"
              type="range"
              min="0.75"
              max="1.45"
              step="0.05"
              value={theme.fontScale}
              onChange={(event) => updateTheme({ fontScale: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            Position
            <input
              aria-label="Position"
              type="range"
              min="0.18"
              max="0.82"
              step="0.02"
              value={theme.verticalPosition}
              onChange={(event) =>
                updateTheme({ verticalPosition: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            Alignment
            <select
              aria-label="Alignment"
              value={theme.textAlign}
              onChange={(event) =>
                updateTheme({ textAlign: event.currentTarget.value as VisualTheme["textAlign"] })
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label>
            Transition
            <select
              aria-label="Transition"
              value={theme.transition}
              onChange={(event) =>
                updateTheme({ transition: event.currentTarget.value as VisualTheme["transition"] })
              }
            >
              <option value="fade">Fade</option>
              <option value="none">None</option>
            </select>
          </label>
          <label>
            Background
            <input
              aria-label="Background"
              type="color"
              value={theme.backgroundColor}
              onChange={(event) => updateTheme({ backgroundColor: event.currentTarget.value })}
            />
          </label>
          <label>
            Text
            <input
              aria-label="Text"
              type="color"
              value={theme.textColor}
              onChange={(event) => updateTheme({ textColor: event.currentTarget.value })}
            />
          </label>
          <label>
            Highlight
            <input
              aria-label="Highlight"
              type="color"
              value={theme.highlightColor}
              onChange={(event) => updateTheme({ highlightColor: event.currentTarget.value })}
            />
          </label>
          <label>
            Blur
            <input
              aria-label="Blur"
              type="range"
              min="0"
              max="18"
              step="1"
              value={theme.backgroundBlur}
              onChange={(event) =>
                updateTheme({ backgroundBlur: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={theme.showAdjacentLines}
              onChange={(event) => updateTheme({ showAdjacentLines: event.currentTarget.checked })}
            />
            Adjacent lines
          </label>
          <label>
            <input
              type="checkbox"
              checked={theme.showWordHighlight}
              onChange={(event) => updateTheme({ showWordHighlight: event.currentTarget.checked })}
            />
            Word highlight
          </label>
          <label>
            <input
              type="checkbox"
              checked={theme.highContrast}
              onChange={(event) => updateTheme({ highContrast: event.currentTarget.checked })}
            />
            High contrast
          </label>
          <div className="background-actions">
            <label className="button-label">
              Background image
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void chooseBackground(file);
                }}
              />
            </label>
            <button type="button" disabled={!theme.backgroundImage} onClick={clearBackground}>
              Clear image
            </button>
          </div>
          <button type="button" onClick={() => updateTheme(defaultVisualTheme)}>
            Reset style
          </button>
        </section>
      </div>
    </section>
  );
}
