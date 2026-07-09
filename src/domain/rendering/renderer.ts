import { layoutFrame, type FrameLayout } from "./layout";
import type { VisualTheme } from "./schema";
import type { FrameLyrics } from "./timing";

export interface RenderFrameInput {
  readonly theme: VisualTheme;
  readonly lyrics: FrameLyrics;
  readonly backgroundImage?: CanvasImageSource;
  readonly drawSafeArea?: boolean;
  readonly reducedMotion?: boolean;
}

function fontFamily(theme: VisualTheme): string {
  if (theme.fontFamily === "serif") return "Georgia, serif";
  if (theme.fontFamily === "mono") return '"Courier New", monospace';
  return 'Tahoma, "MS Sans Serif", Geneva, sans-serif';
}

function paintBackground(
  context: CanvasRenderingContext2D,
  layout: FrameLayout,
  input: RenderFrameInput,
): void {
  const { preset } = layout;
  context.fillStyle = input.theme.backgroundColor;
  context.fillRect(0, 0, preset.width, preset.height);
  if (!input.backgroundImage) return;
  context.save();
  if (input.theme.backgroundBlur > 0) context.filter = `blur(${input.theme.backgroundBlur}px)`;
  context.globalAlpha = 0.72;
  context.drawImage(input.backgroundImage, 0, 0, preset.width, preset.height);
  context.restore();
  context.fillStyle = "rgba(0, 0, 0, 0.34)";
  context.fillRect(0, 0, preset.width, preset.height);
}

function measuredLineX(
  theme: VisualTheme,
  layout: FrameLayout,
  measuredWidth: number,
): number {
  const { safeArea } = layout;
  if (theme.textAlign === "left") return safeArea.x;
  if (theme.textAlign === "right") return safeArea.x + safeArea.width - measuredWidth;
  return safeArea.x + (safeArea.width - measuredWidth) / 2;
}

export function renderFrame(
  context: CanvasRenderingContext2D,
  input: RenderFrameInput,
): FrameLayout {
  const layout = layoutFrame(input.theme, input.lyrics);
  const { preset, safeArea } = layout;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, preset.width, preset.height);
  paintBackground(context, layout, input);
  if (input.drawSafeArea) {
    context.strokeStyle = "rgba(255, 255, 255, 0.65)";
    context.lineWidth = Math.max(2, Math.round(preset.width / 360));
    context.setLineDash([context.lineWidth * 3, context.lineWidth * 2]);
    context.strokeRect(safeArea.x, safeArea.y, safeArea.width, safeArea.height);
    context.setLineDash([]);
  }

  context.textBaseline = "top";
  context.lineJoin = "round";
  for (const line of layout.lines) {
    const current = line.role === "current";
    context.font = `700 ${line.fontSize}px ${fontFamily(input.theme)}`;
    context.textAlign = "left";
    context.globalAlpha = current || input.reducedMotion ? 1 : 0.78;
    const measuredRunWidths = line.runs.map((run) => context.measureText(run.text).width);
    let x = measuredLineX(
      input.theme,
      layout,
      measuredRunWidths.reduce((sum, width) => sum + width, 0),
    );
    for (const [index, run] of line.runs.entries()) {
      const color =
        run.active && input.theme.showWordHighlight
          ? input.theme.highlightColor
          : current
            ? input.theme.textColor
            : input.theme.adjacentTextColor;
      context.lineWidth = input.theme.highContrast
        ? Math.max(4, Math.round(line.fontSize / 12))
        : 0;
      if (context.lineWidth > 0) {
        context.strokeStyle = input.theme.outlineColor;
        context.strokeText(run.text, x, run.y);
      }
      context.fillStyle = color;
      context.fillText(run.text, x, run.y);
      x += measuredRunWidths[index] ?? 0;
    }
  }
  context.restore();
  return layout;
}
