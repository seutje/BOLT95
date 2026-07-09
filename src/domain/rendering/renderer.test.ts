import { describe, expect, it } from "vitest";
import { renderFrame } from "./renderer";
import { defaultVisualTheme, type VisualTheme } from "./schema";
import type { FrameLyrics } from "./timing";

interface TextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

interface ImageCall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function contextStub(
  fillCalls: TextCall[],
  imageCalls: ImageCall[] = [],
): CanvasRenderingContext2D {
  const context = {
    clearRect: () => undefined,
    drawImage: (_image: CanvasImageSource, x: number, y: number, width: number, height: number) =>
      imageCalls.push({ x, y, width, height }),
    fillRect: () => undefined,
    fillText: (text: string, x: number, y: number) => fillCalls.push({ text, x, y }),
    measureText: (text: string) => ({ width: text.length * 10 }),
    restore: () => undefined,
    save: () => undefined,
    setLineDash: () => undefined,
    setTransform: () => undefined,
    strokeRect: () => undefined,
    strokeText: () => undefined,
    fillStyle: "",
    filter: "",
    font: "",
    globalAlpha: 1,
    lineJoin: "round",
    lineWidth: 0,
    strokeStyle: "",
    textAlign: "left",
    textBaseline: "top",
  };
  return context as unknown as CanvasRenderingContext2D;
}

function theme(): VisualTheme {
  return {
    ...defaultVisualTheme,
    highContrast: false,
    showAdjacentLines: false,
    textAlign: "left",
  };
}

describe("lyric frame renderer", () => {
  it("centers unhighlighted text with measured canvas width", () => {
    const lyrics: FrameLyrics = {
      current: {
        id: "current",
        role: "current",
        text: "loom of",
        words: [],
      },
    };
    const fillCalls: TextCall[] = [];

    renderFrame(contextStub(fillCalls), {
      theme: { ...theme(), textAlign: "center" },
      lyrics,
    });

    const loom = fillCalls.find((call) => call.text === "loom of");
    expect(loom).toBeDefined();
    expect(loom?.x).toBe(445);
  });

  it("draws highlighted word runs at positions advanced by preceding measured spaces", () => {
    const lyrics: FrameLyrics = {
      current: {
        id: "current",
        role: "current",
        text: "My mind's a loom of restless threads",
        words: ["My", "mind's", "a", "loom", "of", "restless", "threads"].map((text) => ({
          text,
          active: text === "of",
        })),
      },
    };
    const fillCalls: TextCall[] = [];

    renderFrame(contextStub(fillCalls), { theme: theme(), lyrics });

    const loom = fillCalls.find((call) => call.text === "loom");
    const of = fillCalls.find((call) => call.text === "of");

    expect(loom).toBeDefined();
    expect(of).toBeDefined();
    expect(of!.x - loom!.x).toBe(50);
  });

  it("contains background images without changing their aspect ratio", () => {
    const lyrics: FrameLyrics = {
      current: {
        id: "current",
        role: "current",
        text: "wide background",
        words: [],
      },
    };
    const imageCalls: ImageCall[] = [];
    const image = { naturalWidth: 1600, naturalHeight: 900 } as HTMLImageElement;

    renderFrame(contextStub([], imageCalls), {
      theme: { ...theme(), preset: "square-draft" },
      lyrics,
      backgroundImage: image,
    });

    expect(imageCalls).toEqual([{ x: 0, y: 118.125, width: 540, height: 303.75 }]);
  });
});
