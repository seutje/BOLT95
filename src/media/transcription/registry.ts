import rawManifest from "../../../config/models.json";
import {
  modelManifestSchema,
  type ModelManifest,
  type WhisperModelDescriptor,
} from "../../domain/models/manifest";
import type { ProcessingRisk } from "../audio/types";
import type { TranscriptionLanguageMode, TranscriptionModelChoice } from "./types";

export const modelManifest: ModelManifest = modelManifestSchema.parse(rawManifest);

const riskRank: Record<ProcessingRisk, number> = {
  low: 0,
  moderate: 1,
  high: 2,
};

const deviceRank: Record<WhisperModelDescriptor["recommendedDeviceClass"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function selectableModels(
  languageMode: TranscriptionLanguageMode,
): readonly WhisperModelDescriptor[] {
  return modelManifest.models.filter((model) => {
    if (languageMode === "en") return true;
    if (languageMode === "auto" || languageMode === "multilingual") {
      return model.languageMode === "multilingual";
    }
    return false;
  });
}

export function selectModelForTranscription(options: {
  readonly languageMode: TranscriptionLanguageMode;
  readonly audioRisk: ProcessingRisk;
  readonly requestedModelId?: string;
}): TranscriptionModelChoice {
  const models = selectableModels(options.languageMode);
  const requested = models.find((model) => model.id === options.requestedModelId);
  if (requested) {
    return { model: requested, reason: "Selected by user." };
  }

  const maximumRank =
    options.audioRisk === "high" ? deviceRank.low : riskRank[options.audioRisk] + 1;
  const selected =
    models
      .filter((model) => deviceRank[model.recommendedDeviceClass] <= maximumRank)
      .sort((left, right) => right.sizeBytes - left.sizeBytes)[0] ?? models[0];

  if (!selected) {
    throw new Error("No compatible Whisper model is registered.");
  }

  return {
    model: selected,
    reason:
      options.audioRisk === "high"
        ? "High-risk audio uses the smallest registered model by default."
        : "Selected from the registry for this language mode and device risk.",
  };
}
