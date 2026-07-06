import { z } from "zod";
import {
  canonicalLyricsSchema,
  normalizeLyricToken,
  reviewStateSchema,
  timingProvenanceSchema,
  type CanonicalLine,
  type CanonicalLyrics,
  type CanonicalToken,
  type ReviewState,
  type TimingProvenance,
} from "../lyrics/canonical";

export const transcriptWordSchema = z.object({
  id: z.string(),
  text: z.string(),
  normalized: z.array(z.string()).optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
});

export const transcriptResultSchema = z.object({
  schemaVersion: z.literal(1),
  durationMs: z.number().int().positive(),
  language: z.string().optional(),
  words: z.array(transcriptWordSchema),
});

export const manualLineTimingSchema = z.object({
  lineId: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});

export const alignedWordSchema = z.object({
  canonicalTokenId: z.string(),
  transcriptWordId: z.string().optional(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
  score: z.number(),
  confidence: z.number().min(0).max(1),
  provenance: timingProvenanceSchema,
});

export const alignedLineSchema = z.object({
  lineId: z.string(),
  displayText: z.string(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
  confidence: z.number().min(0).max(1),
  provenance: timingProvenanceSchema,
  reviewState: reviewStateSchema,
  ambiguous: z.boolean(),
  warnings: z.array(z.string()),
});

export const alignmentIssueSchema = z.object({
  code: z.enum(["REPEATED_BLOCK", "SUSPICIOUS_JUMP", "LARGE_UNMATCHED_SPAN", "WRONG_SONG_LIKELY"]),
  message: z.string(),
  lineIds: z.array(z.string()),
});

export const alignmentResultSchema = z.object({
  schemaVersion: z.literal(1),
  engineVersion: z.string(),
  canonical: canonicalLyricsSchema,
  transcript: transcriptResultSchema,
  words: z.array(alignedWordSchema),
  lines: z.array(alignedLineSchema),
  issues: z.array(alignmentIssueSchema),
  benchmark: z.object({
    canonicalWords: z.number().int().nonnegative(),
    transcriptWords: z.number().int().nonnegative(),
    cells: z.number().int().nonnegative(),
    elapsedMs: z.number().nonnegative(),
    hierarchicalAlignmentTriggered: z.boolean(),
  }),
});

export type TranscriptWord = z.infer<typeof transcriptWordSchema>;
export type TranscriptResult = z.infer<typeof transcriptResultSchema>;
export type ManualLineTiming = z.infer<typeof manualLineTimingSchema>;
export type AlignedWord = z.infer<typeof alignedWordSchema>;
export type AlignedLine = z.infer<typeof alignedLineSchema>;
export type AlignmentIssue = z.infer<typeof alignmentIssueSchema>;
export type AlignmentResult = z.infer<typeof alignmentResultSchema>;

export interface AlignmentOptions {
  readonly engineVersion?: string;
  readonly minWordDurationMs?: number;
  readonly minLineDurationMs?: number;
  readonly largeUnmatchedSpan?: number;
  readonly manualLineTimings?: readonly ManualLineTiming[];
}

interface TraceStep {
  readonly canonicalIndex: number;
  readonly transcriptIndex: number;
  readonly kind: "match" | "canonical-gap" | "transcript-gap";
  readonly score: number;
  readonly fuzzy: boolean;
}

interface TimedWord {
  readonly token: CanonicalToken;
  readonly transcript?: TranscriptWord;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly score: number;
  readonly confidence: number;
  readonly provenance: TimingProvenance;
}

const defaultOptions = {
  engineVersion: "0.1.0",
  minWordDurationMs: 80,
  minLineDurationMs: 600,
  largeUnmatchedSpan: 8,
} as const;

function normalizedWord(word: TranscriptWord): string {
  return (word.normalized ?? normalizeLyricToken(word.text))[0] ?? "";
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (previous[rightIndex] ?? 0) + 1,
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + cost,
      );
    }
    for (let index = 0; index < previous.length; index += 1) previous[index] = current[index] ?? 0;
  }
  return previous[right.length] ?? 0;
}

function candidateScore(
  token: CanonicalToken,
  word: TranscriptWord,
): { score: number; fuzzy: boolean } {
  const canonical = token.normalized[0] ?? "";
  const transcript = normalizedWord(word);
  if (!canonical || !transcript) return { score: -3, fuzzy: false };
  if (canonical === transcript) return { score: 4, fuzzy: false };
  const distance = editDistance(canonical, transcript);
  const longest = Math.max(canonical.length, transcript.length);
  if (longest >= 4 && distance / longest <= 0.34) return { score: 2, fuzzy: true };
  if (canonical[0] === transcript[0] && distance <= 2) return { score: 1, fuzzy: true };
  return { score: -3, fuzzy: false };
}

function alignWords(
  tokens: readonly CanonicalToken[],
  transcript: readonly TranscriptWord[],
): readonly TraceStep[] {
  const rows = tokens.length + 1;
  const columns = transcript.length + 1;
  const scores = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
  const trace = Array.from({ length: rows }, () =>
    Array.from<"match" | "canonical-gap" | "transcript-gap">({ length: columns }).fill("match"),
  );
  const canonicalGapPenalty = -1;
  const transcriptGapPenalty = -1;

  for (let row = 1; row < rows; row += 1) {
    scores[row]![0] = row * canonicalGapPenalty;
    trace[row]![0] = "canonical-gap";
  }
  for (let column = 1; column < columns; column += 1) {
    scores[0]![column] = column * transcriptGapPenalty;
    trace[0]![column] = "transcript-gap";
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const candidate = candidateScore(tokens[row - 1]!, transcript[column - 1]!);
      const diagonal = scores[row - 1]![column - 1]! + candidate.score;
      const up = scores[row - 1]![column]! + canonicalGapPenalty;
      const left = scores[row]![column - 1]! + transcriptGapPenalty;
      const best = Math.max(diagonal, up, left);
      scores[row]![column] = best;
      trace[row]![column] =
        best === diagonal ? "match" : best === up ? "canonical-gap" : "transcript-gap";
    }
  }

  const steps: TraceStep[] = [];
  let row = tokens.length;
  let column = transcript.length;
  while (row > 0 || column > 0) {
    const kind = trace[row]![column]!;
    if (kind === "match" && row > 0 && column > 0) {
      const scored = candidateScore(tokens[row - 1]!, transcript[column - 1]!);
      steps.push({
        canonicalIndex: row - 1,
        transcriptIndex: column - 1,
        kind,
        score: scored.score,
        fuzzy: scored.fuzzy,
      });
      row -= 1;
      column -= 1;
    } else if ((kind === "canonical-gap" && row > 0) || column === 0) {
      steps.push({
        canonicalIndex: row - 1,
        transcriptIndex: -1,
        kind: "canonical-gap",
        score: canonicalGapPenalty,
        fuzzy: false,
      });
      row -= 1;
    } else {
      steps.push({
        canonicalIndex: -1,
        transcriptIndex: column - 1,
        kind: "transcript-gap",
        score: transcriptGapPenalty,
        fuzzy: false,
      });
      column -= 1;
    }
  }
  return steps.reverse();
}

function clampMs(value: number, durationMs: number): number {
  return Math.max(0, Math.min(durationMs, Math.round(value)));
}

function initialTimedWords(
  tokens: readonly CanonicalToken[],
  transcript: readonly TranscriptWord[],
  steps: readonly TraceStep[],
  durationMs: number,
): TimedWord[] {
  const byToken = new Map<number, TimedWord>();
  let lastEnd = 0;
  for (const step of steps) {
    if (step.canonicalIndex < 0) continue;
    const token = tokens[step.canonicalIndex]!;
    const word = step.transcriptIndex >= 0 ? transcript[step.transcriptIndex] : undefined;
    const usable =
      step.kind === "match" &&
      word &&
      step.score > 0 &&
      word.startMs >= lastEnd &&
      word.endMs >= word.startMs &&
      word.endMs <= durationMs;
    if (usable) {
      lastEnd = word.endMs;
      byToken.set(step.canonicalIndex, {
        token,
        transcript: word,
        startMs: word.startMs,
        endMs: word.endMs,
        score: step.score,
        confidence: step.fuzzy ? 0.72 : (word.confidence ?? 0.95),
        provenance: step.fuzzy ? "transcript-fuzzy" : "transcript-exact",
      });
    } else {
      byToken.set(step.canonicalIndex, {
        token,
        ...(word ? { transcript: word } : {}),
        score: step.score,
        confidence: 0,
        provenance: "unresolved",
      });
    }
  }
  return tokens.map(
    (token, index) =>
      byToken.get(index) ?? {
        token,
        score: -1,
        confidence: 0,
        provenance: "unresolved",
      },
  );
}

function repairGaps(
  timedWords: readonly TimedWord[],
  durationMs: number,
  minWordDurationMs: number,
): readonly TimedWord[] {
  const result = [...timedWords];
  const anchors = result
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => word.startMs !== undefined && word.endMs !== undefined);

  function assignRange(fromExclusive: number, toExclusive: number, start: number, end: number) {
    const count = toExclusive - fromExclusive - 1;
    if (count <= 0) return;
    const available = Math.max(count * minWordDurationMs, end - start);
    const step = available / count;
    for (let offset = 0; offset < count; offset += 1) {
      const index = fromExclusive + 1 + offset;
      const wordStart = clampMs(start + step * offset, durationMs);
      const wordEnd = clampMs(
        Math.max(wordStart + minWordDurationMs, start + step * (offset + 1)),
        durationMs,
      );
      const prior = result[index]!;
      result[index] = {
        ...prior,
        startMs: wordStart,
        endMs: Math.max(wordStart, wordEnd),
        confidence: 0.35,
        provenance:
          fromExclusive < 0 || toExclusive >= result.length ? "extrapolated" : "interpolated",
      };
    }
  }

  if (anchors.length === 0) return result;
  assignRange(-1, anchors[0]!.index, 0, anchors[0]!.word.startMs ?? 0);
  for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
    assignRange(
      anchors[anchorIndex]!.index,
      anchors[anchorIndex + 1]!.index,
      anchors[anchorIndex]!.word.endMs ?? 0,
      anchors[anchorIndex + 1]!.word.startMs ?? durationMs,
    );
  }
  assignRange(anchors.at(-1)!.index, result.length, anchors.at(-1)!.word.endMs ?? 0, durationMs);
  return result;
}

function normalizedLineKey(line: CanonicalLine, tokens: readonly CanonicalToken[]): string {
  const tokenSet = new Set(line.tokenIds);
  return tokens
    .filter((token) => tokenSet.has(token.id) && token.kind !== "annotation")
    .flatMap((token) => token.normalized)
    .join(" ");
}

function repeatedLineIds(lyrics: CanonicalLyrics): Set<string> {
  const groups = new Map<string, string[]>();
  for (const line of lyrics.lines) {
    const key = normalizedLineKey(line, lyrics.tokens);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), line.id]);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}

function deriveLines(
  lyrics: CanonicalLyrics,
  timedWords: readonly TimedWord[],
  options: Required<Pick<AlignmentOptions, "minLineDurationMs">>,
  durationMs: number,
  manualTimings: readonly ManualLineTiming[],
): readonly AlignedLine[] {
  const wordsByToken = new Map(timedWords.map((word) => [word.token.id, word]));
  const manualByLine = new Map(manualTimings.map((timing) => [timing.lineId, timing]));
  const repeated = repeatedLineIds(lyrics);
  const lines: AlignedLine[] = [];

  for (const line of lyrics.lines) {
    const manual = manualByLine.get(line.id);
    if (manual) {
      lines.push({
        lineId: line.id,
        displayText: line.displayText,
        startMs: clampMs(manual.startMs, durationMs),
        endMs: clampMs(
          Math.max(manual.endMs, manual.startMs + options.minLineDurationMs),
          durationMs,
        ),
        confidence: 1,
        provenance: "manual",
        reviewState: "accepted",
        ambiguous: false,
        warnings: [],
      });
      continue;
    }

    const lineWords = line.tokenIds.flatMap((id) => {
      const word = wordsByToken.get(id);
      return word && word.token.kind !== "annotation" ? [word] : [];
    });
    const timedLineWords = lineWords.filter(
      (word) => word.startMs !== undefined && word.endMs !== undefined,
    );
    const lrcStart = line.timestamps[0]?.milliseconds;
    const ambiguous = repeated.has(line.id);
    const warnings = ambiguous ? ["Repeated lyric block needs review."] : [];

    if (timedLineWords.length > 0) {
      const startMs = Math.min(...timedLineWords.map((word) => word.startMs!));
      const rawEnd = Math.max(...timedLineWords.map((word) => word.endMs!));
      const endMs = clampMs(Math.max(rawEnd, startMs + options.minLineDurationMs), durationMs);
      const confidence =
        timedLineWords.reduce((sum, word) => sum + word.confidence, 0) / timedLineWords.length;
      const lowConfidence = confidence < 0.55;
      lines.push({
        lineId: line.id,
        displayText: line.displayText,
        startMs,
        endMs,
        confidence: Number(confidence.toFixed(3)),
        provenance: timedLineWords.every((word) => word.provenance === "transcript-exact")
          ? "transcript-exact"
          : "interpolated",
        reviewState: ambiguous ? "ambiguous" : lowConfidence ? "needs-review" : "accepted",
        ambiguous,
        warnings: lowConfidence ? [...warnings, "Low confidence timing."] : warnings,
      });
    } else if (lrcStart !== undefined) {
      lines.push({
        lineId: line.id,
        displayText: line.displayText,
        startMs: clampMs(lrcStart, durationMs),
        endMs: clampMs(lrcStart + options.minLineDurationMs, durationMs),
        confidence: 0.8,
        provenance: "lrc",
        reviewState: ambiguous ? "ambiguous" : "needs-review",
        ambiguous,
        warnings,
      });
    } else {
      lines.push({
        lineId: line.id,
        displayText: line.displayText,
        confidence: 0,
        provenance: "unresolved",
        reviewState: line.blank ? "accepted" : "unresolved",
        ambiguous,
        warnings: line.blank ? warnings : [...warnings, "No timing evidence."],
      });
    }
  }

  let previousEnd = 0;
  return lines.map((line) => {
    if (line.startMs === undefined || line.endMs === undefined) return line;
    const startMs = clampMs(Math.max(line.startMs, previousEnd), durationMs);
    const endMs = clampMs(Math.max(line.endMs, startMs + options.minLineDurationMs), durationMs);
    previousEnd = endMs;
    return { ...line, startMs, endMs };
  });
}

function detectIssues(
  lyrics: CanonicalLyrics,
  lines: readonly AlignedLine[],
  words: readonly AlignedWord[],
  largeUnmatchedSpan: number,
): readonly AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const repeated = repeatedLineIds(lyrics);
  if (repeated.size > 0) {
    issues.push({
      code: "REPEATED_BLOCK",
      message: "Repeated lyric blocks were marked ambiguous for review.",
      lineIds: [...repeated],
    });
  }

  let unmatchedRun = 0;
  let unmatchedLineIds = new Set<string>();
  const tokenToLine = new Map(lyrics.tokens.map((token) => [token.id, token.lineId]));
  for (const word of words) {
    if (word.provenance === "unresolved") {
      unmatchedRun += 1;
      const lineId = tokenToLine.get(word.canonicalTokenId);
      if (lineId) unmatchedLineIds.add(lineId);
    } else {
      if (unmatchedRun >= largeUnmatchedSpan) {
        issues.push({
          code: "LARGE_UNMATCHED_SPAN",
          message: `${unmatchedRun} consecutive canonical words were not matched.`,
          lineIds: [...unmatchedLineIds],
        });
      }
      unmatchedRun = 0;
      unmatchedLineIds = new Set();
    }
  }

  const timedLines = lines.filter((line) => line.startMs !== undefined && line.endMs !== undefined);
  for (let index = 1; index < timedLines.length; index += 1) {
    if ((timedLines[index]!.startMs ?? 0) < (timedLines[index - 1]!.startMs ?? 0)) {
      issues.push({
        code: "SUSPICIOUS_JUMP",
        message: "A line timing jump moved backward.",
        lineIds: [timedLines[index - 1]!.lineId, timedLines[index]!.lineId],
      });
    }
  }

  const averageConfidence =
    lines.length === 0 ? 0 : lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length;
  if (averageConfidence < 0.35 && lyrics.tokens.length > 0) {
    issues.push({
      code: "WRONG_SONG_LIKELY",
      message: "Most supplied lyrics did not match the transcript evidence.",
      lineIds: lines.map((line) => line.lineId),
    });
  }
  return issues;
}

export function alignCanonicalLyrics(
  canonical: CanonicalLyrics,
  transcriptInput: TranscriptResult,
  options: AlignmentOptions = {},
): AlignmentResult {
  const started = performance.now();
  const resolved = { ...defaultOptions, ...options };
  const transcript = transcriptResultSchema.parse({
    ...transcriptInput,
    words: transcriptInput.words.map((word) => ({
      ...word,
      normalized: word.normalized ?? normalizeLyricToken(word.text),
    })),
  });
  const wordTokens = canonical.tokens.filter((token) => token.kind !== "annotation");
  const steps = alignWords(wordTokens, transcript.words);
  const initial = initialTimedWords(wordTokens, transcript.words, steps, transcript.durationMs);
  const repaired = repairGaps(initial, transcript.durationMs, resolved.minWordDurationMs);
  const words = repaired.map<AlignedWord>((word) => ({
    canonicalTokenId: word.token.id,
    ...(word.transcript ? { transcriptWordId: word.transcript.id } : {}),
    ...(word.startMs !== undefined ? { startMs: word.startMs } : {}),
    ...(word.endMs !== undefined ? { endMs: word.endMs } : {}),
    score: word.score,
    confidence: Number(word.confidence.toFixed(3)),
    provenance: word.provenance,
  }));
  const lines = deriveLines(
    canonical,
    repaired,
    { minLineDurationMs: resolved.minLineDurationMs },
    transcript.durationMs,
    options.manualLineTimings ?? [],
  );
  const issues = detectIssues(canonical, lines, words, resolved.largeUnmatchedSpan);
  const elapsedMs = performance.now() - started;
  return alignmentResultSchema.parse({
    schemaVersion: 1,
    engineVersion: resolved.engineVersion,
    canonical,
    transcript,
    words,
    lines,
    issues,
    benchmark: {
      canonicalWords: wordTokens.length,
      transcriptWords: transcript.words.length,
      cells: (wordTokens.length + 1) * (transcript.words.length + 1),
      elapsedMs,
      hierarchicalAlignmentTriggered: false,
    },
  });
}

export function lineReviewLabel(state: ReviewState): string {
  switch (state) {
    case "accepted":
      return "Accepted";
    case "needs-review":
      return "Needs review";
    case "ambiguous":
      return "Ambiguous";
    case "unresolved":
      return "Unresolved";
  }
}
