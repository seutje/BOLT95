import type { RenderPreset } from "./schema";

export interface RenderPresetDefinition {
  readonly id: RenderPreset;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly safeArea: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly draft: boolean;
}

const definitions: Record<RenderPreset, RenderPresetDefinition> = {
  "square-full": {
    id: "square-full",
    label: "Square 1080",
    width: 1080,
    height: 1080,
    safeArea: { x: 108, y: 108, width: 864, height: 864 },
    draft: false,
  },
  "portrait-full": {
    id: "portrait-full",
    label: "Portrait 1080x1920",
    width: 1080,
    height: 1920,
    safeArea: { x: 86, y: 192, width: 908, height: 1536 },
    draft: false,
  },
  "landscape-full": {
    id: "landscape-full",
    label: "Landscape 1920x1080",
    width: 1920,
    height: 1080,
    safeArea: { x: 154, y: 108, width: 1612, height: 864 },
    draft: false,
  },
  "square-draft": {
    id: "square-draft",
    label: "Square draft",
    width: 540,
    height: 540,
    safeArea: { x: 54, y: 54, width: 432, height: 432 },
    draft: true,
  },
  "portrait-draft": {
    id: "portrait-draft",
    label: "Portrait draft",
    width: 540,
    height: 960,
    safeArea: { x: 43, y: 96, width: 454, height: 768 },
    draft: true,
  },
  "landscape-draft": {
    id: "landscape-draft",
    label: "Landscape draft",
    width: 960,
    height: 540,
    safeArea: { x: 77, y: 54, width: 806, height: 432 },
    draft: true,
  },
};

export const renderPresets: readonly RenderPresetDefinition[] = Object.freeze([
  definitions["square-full"],
  definitions["portrait-full"],
  definitions["landscape-full"],
  definitions["square-draft"],
  definitions["portrait-draft"],
  definitions["landscape-draft"],
]);

export function getRenderPreset(id: RenderPreset): RenderPresetDefinition {
  return definitions[id];
}
