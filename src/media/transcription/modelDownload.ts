import { AppError } from "../../app/errors/AppError";
import type { WhisperModelDescriptor } from "../../domain/models/manifest";
import { runtimeAssetUrls } from "../../infrastructure/assets/urls";
import { storeModelBlob } from "../../infrastructure/storage/models";
import type { ModelCacheEntry, TranscriptionProgress } from "./types";

export async function downloadRegisteredModel(options: {
  readonly model: WhisperModelDescriptor;
  readonly signal: AbortSignal;
  readonly onProgress?: (progress: TranscriptionProgress) => void;
}): Promise<ModelCacheEntry> {
  const url = runtimeAssetUrls.model(options.model.fileName);
  let response: Response;
  try {
    response = await fetch(url, { signal: options.signal });
  } catch (error) {
    if (options.signal.aborted) {
      throw new AppError("JOB_CANCELLED", "Model download was cancelled.", {
        recoveryAction: "Start the download again when ready.",
      });
    }
    throw error;
  }
  if (!response.ok || !response.body) {
    throw new AppError("INPUT_INVALID", "Model download failed.", {
      technicalDetail: `${options.model.id}: HTTP ${response.status}`,
      recoveryAction: "Check that the model artifact was deployed and try again.",
    });
  }

  const headerBytes = Number(response.headers.get("content-length"));
  const totalBytes =
    Number.isFinite(headerBytes) && headerBytes > 0 ? headerBytes : options.model.sizeBytes;
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loadedBytes = 0;

  for (;;) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch (error) {
      if (options.signal.aborted) {
        throw new AppError("JOB_CANCELLED", "Model download was cancelled.", {
          recoveryAction: "Start the download again when ready.",
        });
      }
      throw error;
    }
    const { done, value } = result;
    if (done) break;
    chunks.push(new Uint8Array(value).buffer);
    loadedBytes += value.byteLength;
    options.onProgress?.({
      phase: "download",
      message: "Downloading model to local cache...",
      loadedBytes,
      totalBytes,
    });
  }

  if (options.signal.aborted) {
    throw new AppError("JOB_CANCELLED", "Model download was cancelled.", {
      recoveryAction: "Start the download again when ready.",
    });
  }

  options.onProgress?.({
    phase: "integrity",
    message: "Verifying model integrity...",
    loadedBytes,
    totalBytes,
  });
  return storeModelBlob(options.model, new Blob(chunks, { type: "application/octet-stream" }));
}

export async function storeUserSuppliedModel(options: {
  readonly model: WhisperModelDescriptor;
  readonly file: File;
}): Promise<ModelCacheEntry> {
  if (!options.file.name.endsWith(".bin")) {
    throw new AppError("INPUT_INVALID", "Supplied model must be a GGML .bin file.", {
      technicalDetail: `Received ${options.file.name || "unnamed file"}`,
      recoveryAction: "Choose the exact GGML model file listed for the selected model.",
    });
  }
  return storeModelBlob(options.model, options.file, true);
}
