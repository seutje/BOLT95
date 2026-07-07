import { useEffect, useRef } from "react";
import type { EditorProject } from "../../domain/project/schema";
import { getRenderPreset } from "../../domain/rendering/presets";
import { renderFrame } from "../../domain/rendering/renderer";
import type { VisualTheme } from "../../domain/rendering/schema";
import { lyricsForFrame } from "../../domain/rendering/timing";
import { createPreviewLoop } from "../../media/preview/previewLoop";

interface PreviewCanvasProps {
  readonly project: EditorProject;
  readonly theme: VisualTheme;
  readonly timeMs: number;
  readonly backgroundImage?: HTMLImageElement | undefined;
  readonly drawSafeArea: boolean;
  readonly reducedMotion: boolean;
}

export function PreviewCanvas({
  project,
  theme,
  timeMs,
  backgroundImage,
  drawSafeArea,
  reducedMotion,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const preset = getRenderPreset(theme.preset);
    canvas.width = preset.width;
    canvas.height = preset.height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    const loop = createPreviewLoop(() => {
      renderFrame(context, {
        theme,
        lyrics: lyricsForFrame(project, timeMs),
        drawSafeArea,
        reducedMotion,
        ...(backgroundImage ? { backgroundImage } : {}),
      });
    }, reducedMotion);
    loop.start();
    return () => loop.stop();
  }, [backgroundImage, drawSafeArea, project, reducedMotion, theme, timeMs]);

  return (
    <canvas ref={canvasRef} className="lyric-preview-canvas" aria-label="Lyric video preview" />
  );
}
