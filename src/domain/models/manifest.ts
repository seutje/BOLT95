import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.string().regex(/^[a-f0-9]{40}$/u);

export const whisperModelDescriptorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  fileName: z.string().regex(/^ggml-[a-z0-9_.-]+\.bin$/u),
  url: z.url().startsWith("https://huggingface.co/ggerganov/whisper.cpp/resolve/"),
  sizeBytes: z.number().int().positive(),
  sha256,
  modelType: z.literal("ggml-q5_1"),
  languageMode: z.enum(["multilingual", "english-only"]),
  recommendedDeviceClass: z.enum(["low", "medium", "high"]),
  bundled: z.boolean(),
});

export const modelManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceRevision: revision,
    models: z.array(whisperModelDescriptorSchema).min(1),
  })
  .superRefine((manifest, context) => {
    const ids = new Set<string>();
    const files = new Set<string>();

    for (const model of manifest.models) {
      if (ids.has(model.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate model id: ${model.id}`,
        });
      }
      if (files.has(model.fileName)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate model file: ${model.fileName}`,
        });
      }
      if (!model.url.includes(`/${manifest.sourceRevision}/`)) {
        context.addIssue({
          code: "custom",
          message: `Model URL is not pinned to ${manifest.sourceRevision}`,
        });
      }
      ids.add(model.id);
      files.add(model.fileName);
    }
  });

export type WhisperModelDescriptor = z.infer<typeof whisperModelDescriptorSchema>;
export type ModelManifest = z.infer<typeof modelManifestSchema>;
