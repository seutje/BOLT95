import { z } from "zod";
import {
  alignedLineSchema,
  alignedWordSchema,
  alignmentResultSchema,
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

export const projectAudioLinkSchema = z.object({
  durationMs: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  format: z.literal("MP3"),
});

export const editorLineSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    provenance: z.enum([
      "transcript-exact",
      "transcript-fuzzy",
      "interpolated",
      "extrapolated",
      "lrc",
      "manual",
    ]),
    reviewState: z.enum(["accepted", "needs-review", "ambiguous", "unresolved"]),
  })
  .refine((line) => line.endMs >= line.startMs, {
    message: "Line end must be greater than or equal to start.",
    path: ["endMs"],
  });

export const editorProjectSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  title: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  audio: projectAudioLinkSchema,
  alignment: alignmentResultSchema,
  lines: z.array(editorLineSchema),
});

export const projectFileSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  appVersion: z.string(),
  project: editorProjectSchemaV1,
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type AlignmentProject = z.infer<typeof alignmentProjectSchema>;
export type ProjectAudioLink = z.infer<typeof projectAudioLinkSchema>;
export type EditorLine = z.infer<typeof editorLineSchema>;
export type EditorProject = z.infer<typeof editorProjectSchemaV1>;
export type ProjectFileV1 = z.infer<typeof projectFileSchemaV1>;
