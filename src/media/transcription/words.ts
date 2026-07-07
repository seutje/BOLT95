import { normalizeLyricToken } from "../../domain/lyrics/canonical";
import type { TranscriptWord } from "../../domain/alignment/engine";
import type { TranscriptionResult, WhisperRawResult, WhisperRawSegment } from "./types";

const languageNames: Record<number, string> = {
  0: "en",
};

function cleanTokenText(text: string): string {
  return text.replace(/^[_\s]+|[_\s]+$/gu, "").trim();
}

function segmentWords(segment: WhisperRawSegment): readonly TranscriptWord[] {
  const timedTokens = segment.tokens
    .map((token, index) => ({
      token,
      index,
      text: cleanTokenText(token.text),
    }))
    .filter((entry) => entry.text.length > 0);

  if (timedTokens.length > 0) {
    return timedTokens.map((entry, index) => {
      const fallbackStart =
        segment.startMs +
        Math.round(((segment.endMs - segment.startMs) * index) / timedTokens.length);
      const fallbackEnd =
        segment.startMs +
        Math.round(((segment.endMs - segment.startMs) * (index + 1)) / timedTokens.length);
      const startMs = Math.max(segment.startMs, Math.round(entry.token.startMs ?? fallbackStart));
      const endMs = Math.max(
        startMs,
        Math.min(segment.endMs, Math.round(entry.token.endMs ?? fallbackEnd)),
      );
      return {
        id: `w-${segment.startMs}-${entry.index}`,
        text: entry.text,
        normalized: [...normalizeLyricToken(entry.text)],
        startMs,
        endMs,
        confidence: Math.max(0, Math.min(1, entry.token.probability)),
      };
    });
  }

  const words = segment.text.split(/\s+/u).map(cleanTokenText).filter(Boolean);
  return words.map((text, index) => {
    const startMs =
      segment.startMs + Math.round(((segment.endMs - segment.startMs) * index) / words.length);
    const endMs =
      segment.startMs +
      Math.round(((segment.endMs - segment.startMs) * (index + 1)) / words.length);
    return {
      id: `w-${segment.startMs}-${index}`,
      text,
      normalized: [...normalizeLyricToken(text)],
      startMs,
      endMs: Math.max(startMs, endMs),
      confidence: 0.5,
    };
  });
}

function repairMonotonic(words: readonly TranscriptWord[], durationMs: number): TranscriptWord[] {
  let previousEnd = 0;
  return words.map((word) => {
    const startMs = Math.max(previousEnd, Math.min(durationMs, word.startMs));
    const endMs = Math.max(startMs, Math.min(durationMs, word.endMs));
    previousEnd = endMs;
    return { ...word, startMs, endMs };
  });
}

export function rawWhisperToTranscript(options: {
  readonly raw: WhisperRawResult;
  readonly durationMs: number;
  readonly modelId: string;
}): TranscriptionResult {
  const words = repairMonotonic(options.raw.segments.flatMap(segmentWords), options.durationMs);
  return {
    schemaVersion: 1,
    durationMs: options.durationMs,
    language: options.raw.detectedLanguage ?? languageNames[options.raw.languageId],
    words,
    raw: options.raw,
    modelId: options.modelId,
  };
}
