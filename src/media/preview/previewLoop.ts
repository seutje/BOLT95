export interface PreviewLoop {
  readonly start: () => void;
  readonly stop: () => void;
}

export function createPreviewLoop(
  draw: (nowMs: number) => void,
  reducedMotion: boolean,
): PreviewLoop {
  let frame = 0;
  let active = false;
  const tick = (now: number) => {
    if (!active) return;
    draw(now);
    if (!reducedMotion) frame = window.requestAnimationFrame(tick);
  };
  return {
    start() {
      if (active) return;
      active = true;
      tick(performance.now());
    },
    stop() {
      active = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
