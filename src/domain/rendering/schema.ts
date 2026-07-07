import { z } from "zod";

export const renderPresetSchema = z.enum([
  "square-full",
  "portrait-full",
  "landscape-full",
  "square-draft",
  "portrait-draft",
  "landscape-draft",
]);

export const visualThemeSchema = z.object({
  schemaVersion: z.literal(1),
  preset: renderPresetSchema,
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  adjacentTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  highlightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  fontFamily: z.enum(["system", "serif", "mono"]),
  fontScale: z.number().min(0.75).max(1.45),
  verticalPosition: z.number().min(0.18).max(0.82),
  textAlign: z.enum(["left", "center", "right"]),
  showAdjacentLines: z.boolean(),
  showWordHighlight: z.boolean(),
  highContrast: z.boolean(),
  transition: z.enum(["none", "fade"]),
  backgroundBlur: z.number().int().min(0).max(18),
  backgroundImage: z
    .object({
      fileName: z.string().min(1),
      fileSize: z.number().int().positive(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .optional(),
});

export type RenderPreset = z.infer<typeof renderPresetSchema>;
export type VisualTheme = z.infer<typeof visualThemeSchema>;

export const defaultVisualTheme: VisualTheme = Object.freeze({
  schemaVersion: 1,
  preset: "landscape-draft",
  backgroundColor: "#101018",
  textColor: "#ffffff",
  adjacentTextColor: "#d8d8d8",
  highlightColor: "#ffff66",
  outlineColor: "#000000",
  fontFamily: "system",
  fontScale: 1,
  verticalPosition: 0.58,
  textAlign: "center",
  showAdjacentLines: true,
  showWordHighlight: true,
  highContrast: true,
  transition: "fade",
  backgroundBlur: 0,
});

export function parseVisualTheme(input: unknown): VisualTheme {
  return visualThemeSchema.parse(input ?? defaultVisualTheme);
}

export function withDefaultVisualTheme(theme?: VisualTheme): VisualTheme {
  return theme ?? defaultVisualTheme;
}
