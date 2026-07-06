import { z } from "zod";
import {
  alignedLineSchema,
  alignedWordSchema,
  manualLineTimingSchema,
  transcriptResultSchema,
} from "../alignment/engine";
import { canonicalLyricsSchema } from "../lyrics/canonical";

export const audioProjectInputSchema = z.object({
  durationMs: z.number().int().positive(),
  sampleRate: z.literal(16_000),
  sampleCount: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  format: z.literal("MP3"),
  fileSize: z.number().int().positive(),
});

export const lyricsProjectInputSchema = z.object({
  format: z.enum(["txt", "lrc"]),
  sourceText: z.string(),
  metadata: z.array(z.object({ key: z.string(), value: z.string() })),
  lines: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      sourceStart: z.number().int().nonnegative(),
      sourceEnd: z.number().int().nonnegative(),
      stanza: z.number().int().nonnegative(),
      blank: z.boolean(),
      annotation: z.string().optional(),
      timestamps: z.array(
        z.object({ milliseconds: z.number().int().nonnegative(), raw: z.string() }),
      ),
    }),
  ),
});

export const projectInputSchema = z.object({
  schemaVersion: z.literal(1),
  audio: audioProjectInputSchema,
  lyrics: lyricsProjectInputSchema.optional(),
});

export const alignmentProjectSchema = z.object({
  schemaVersion: z.literal(1),
  canonical: canonicalLyricsSchema,
  transcript: transcriptResultSchema,
  words: z.array(alignedWordSchema),
  lines: z.array(alignedLineSchema),
  manualLineTimings: z.array(manualLineTimingSchema),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type AlignmentProject = z.infer<typeof alignmentProjectSchema>;
