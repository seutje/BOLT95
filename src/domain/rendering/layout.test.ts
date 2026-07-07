import { describe, expect, it } from "vitest";
import { layoutFrame } from "./layout";
import { renderPresets } from "./presets";
import { defaultVisualTheme, type VisualTheme } from "./schema";
import type { FrameLyrics } from "./timing";

const lyrics: FrameLyrics = {
  previous: { id: "a", role: "previous", text: "Previous line", words: [] },
  current: {
    id: "b",
    role: "current",
    text: "Café déjà vu with an extraordinarilylongunbrokenwordthatmustwrap",
    words: [{ text: "déjà", active: true }],
  },
  next: { id: "c", role: "next", text: "Next line", words: [] },
};

function themeFor(preset: VisualTheme["preset"]): VisualTheme {
  return { ...defaultVisualTheme, preset };
}

describe("lyric frame layout", () => {
  it("defines all six required presets with safe areas inside frame bounds", () => {
    expect(renderPresets).toHaveLength(6);
    for (const preset of renderPresets) {
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
      expect(preset.safeArea.x).toBeGreaterThanOrEqual(0);
      expect(preset.safeArea.y).toBeGreaterThanOrEqual(0);
      expect(preset.safeArea.x + preset.safeArea.width).toBeLessThanOrEqual(preset.width);
      expect(preset.safeArea.y + preset.safeArea.height).toBeLessThanOrEqual(preset.height);
    }
  });

  it("keeps wrapped Unicode and long words within the preset safe area", () => {
    for (const preset of renderPresets) {
      const layout = layoutFrame(themeFor(preset.id), lyrics);
      for (const line of layout.lines) {
        expect(line.x).toBeGreaterThanOrEqual(layout.safeArea.x - 1);
        expect(line.x + line.width).toBeLessThanOrEqual(
          layout.safeArea.x + layout.safeArea.width + 1,
        );
        expect(line.y).toBeGreaterThanOrEqual(layout.safeArea.y - 1);
        expect(line.y + line.height).toBeLessThanOrEqual(
          layout.safeArea.y + layout.safeArea.height + 1,
        );
      }
    }
  });

  it("marks active word runs without changing deterministic layout", () => {
    const first = layoutFrame(defaultVisualTheme, lyrics);
    const second = layoutFrame(defaultVisualTheme, lyrics);
    expect(second).toEqual(first);
    expect(first.lines.some((line) => line.runs.some((run) => run.active))).toBe(true);
  });
});
