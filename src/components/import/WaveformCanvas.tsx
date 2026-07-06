import { useEffect, useRef } from "react";
import type { WaveformData } from "../../media/audio/types";
import { formatDuration } from "../../media/audio/format";

interface WaveformCanvasProps {
  readonly waveform: WaveformData;
}

export function WaveformCanvas({ waveform }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.fillStyle = "#000020";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#40ff80";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x < width; x += 1) {
      const index = Math.min(
        waveform.max.length - 1,
        Math.floor((x / width) * waveform.max.length),
      );
      const top = ((1 - (waveform.max[index] ?? 0)) * height) / 2;
      const bottom = ((1 - (waveform.min[index] ?? 0)) * height) / 2;
      context.moveTo(x + 0.5, top);
      context.lineTo(x + 0.5, bottom);
    }
    context.stroke();
  }, [waveform]);

  return (
    <figure className="waveform-figure">
      <canvas ref={canvasRef} width="720" height="120" aria-hidden="true" />
      <figcaption>
        Compact waveform overview: {waveform.min.length} analysis points across{" "}
        {formatDuration(waveform.durationMs)}.
      </figcaption>
    </figure>
  );
}
