import { z } from "zod";
import type { ParsedLyricLine, ParsedLyrics } from "./parser";

export const timingProvenanceSchema = z.enum([
  "transcript-exact",
  "transcript-fuzzy",
  "interpolated",
  "extrapolated",
  "lrc",
  "manual",
  "unresolved",
]);

export const reviewStateSchema = z.enum(["accepted", "needs-review", "ambiguous", "unresolved"]);

export const tokenKindSchema = z.enum(["word", "vocalization", "annotation"]);

export const canonicalTokenSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  lineId: z.string(),
  index: z.number().int().nonnegative(),
  displayText: z.string(),
  normalized: z.array(z.string()),
  sourceStart: z.number().int().nonnegative(),
  sourceEnd: z.number().int().nonnegative(),
  kind: tokenKindSchema,
});

export const canonicalLineSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  displayText: z.string(),
  leadingWhitespace: z.string(),
  trailingWhitespace: z.string(),
  sourceStart: z.number().int().nonnegative(),
  sourceEnd: z.number().int().nonnegative(),
  stanza: z.number().int().nonnegative(),
  blank: z.boolean(),
  annotation: z.string().optional(),
  timestamps: z.array(z.object({ milliseconds: z.number().int().nonnegative(), raw: z.string() })),
  tokenIds: z.array(z.string()),
});

export const canonicalLyricsSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.enum(["txt", "lrc"]),
  sourceText: z.string(),
  metadata: z.array(z.object({ key: z.string(), value: z.string() })),
  lines: z.array(canonicalLineSchema),
  tokens: z.array(canonicalTokenSchema),
});

export type TimingProvenance = z.infer<typeof timingProvenanceSchema>;
export type ReviewState = z.infer<typeof reviewStateSchema>;
export type TokenKind = z.infer<typeof tokenKindSchema>;
export type CanonicalToken = z.infer<typeof canonicalTokenSchema>;
export type CanonicalLine = z.infer<typeof canonicalLineSchema>;
export type CanonicalLyrics = z.infer<typeof canonicalLyricsSchema>;

export interface NormalizationOptions {
  readonly locale?: string;
  readonly numberWords?: ReadonlyMap<string, string>;
}

const defaultNumberWords = new Map<string, string>([
  ["0", "zero"],
  ["1", "one"],
  ["2", "two"],
  ["3", "three"],
  ["4", "four"],
  ["5", "five"],
  ["6", "six"],
  ["7", "seven"],
  ["8", "eight"],
  ["9", "nine"],
  ["10", "ten"],
  ["11", "eleven"],
  ["12", "twelve"],
  ["13", "thirteen"],
  ["14", "fourteen"],
  ["15", "fifteen"],
  ["16", "sixteen"],
  ["17", "seventeen"],
  ["18", "eighteen"],
  ["19", "nineteen"],
  ["20", "twenty"],
]);

const contractionExpansions = new Map<string, readonly string[]>([
  ["cant", ["can", "not"]],
  ["cannot", ["can", "not"]],
  ["dont", ["do", "not"]],
  ["wont", ["will", "not"]],
  ["im", ["i", "am"]],
  ["ive", ["i", "have"]],
  ["ill", ["i", "will"]],
  ["youre", ["you", "are"]],
  ["youve", ["you", "have"]],
  ["theyre", ["they", "are"]],
  ["thats", ["that", "is"]],
  ["whats", ["what", "is"]],
  ["isnt", ["is", "not"]],
  ["aint", ["is", "not"]],
]);

const vocalizationPattern = /^(?:ah+|oh+|o+h+|la+|na+|mm+|hm+|hey+|yeah+|woah+|whoa+)$/u;
const wordPattern = /[\p{L}\p{N}]+(?:['’`´-][\p{L}\p{N}]+)*/gu;

function stripCombiningMarks(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "");
}

export function normalizeLyricToken(
  token: string,
  options: NormalizationOptions = {},
): readonly string[] {
  const numberWords = options.numberWords ?? defaultNumberWords;
  const locale = options.locale ?? "en";
  const canonical = stripCombiningMarks(token)
    .toLocaleLowerCase(locale)
    .replace(/[’`´]/gu, "'")
    .replace(/[‐‑‒–—―]/gu, "-")
    .replace(/['-]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!canonical) return [];
  const expanded = contractionExpansions.get(canonical);
  if (expanded) return expanded;
  return canonical
    .split(/\s+/u)
    .flatMap((part) => numberWords.get(part)?.split(/\s+/u) ?? [part])
    .filter(Boolean);
}

export function classifyToken(displayText: string, normalized: readonly string[]): TokenKind {
  if (normalized.length === 0) return "annotation";
  if (normalized.length === 1 && vocalizationPattern.test(normalized[0] ?? "")) {
    return "vocalization";
  }
  return "word";
}

function splitWhitespace(
  text: string,
): Pick<CanonicalLine, "leadingWhitespace" | "trailingWhitespace"> {
  return {
    leadingWhitespace: text.match(/^\s*/u)?.[0] ?? "",
    trailingWhitespace: text.match(/\s*$/u)?.[0] ?? "",
  };
}

function canonicalizeLine(
  line: ParsedLyricLine,
  lineIndex: number,
  nextTokenIndex: number,
  options: NormalizationOptions,
): { readonly line: CanonicalLine; readonly tokens: readonly CanonicalToken[] } {
  const tokens: CanonicalToken[] = [];
  const tokenIds: string[] = [];
  for (const match of line.text.matchAll(wordPattern)) {
    const displayText = match[0];
    const sourceStart = line.sourceStart + (match.index ?? 0);
    const normalized = normalizeLyricToken(displayText, options);
    if (normalized.length === 0) continue;
    for (const [partIndex, part] of normalized.entries()) {
      const id = `${line.id}-token-${tokens.length + 1}-${partIndex + 1}`;
      tokenIds.push(id);
      tokens.push({
        schemaVersion: 1,
        id,
        lineId: line.id,
        index: nextTokenIndex + tokens.length,
        displayText,
        normalized: [part],
        sourceStart,
        sourceEnd: sourceStart + displayText.length,
        kind: classifyToken(displayText, [part]),
      });
    }
  }

  if (line.annotation && tokens.length === 0) {
    const id = `${line.id}-annotation`;
    tokenIds.push(id);
    tokens.push({
      schemaVersion: 1,
      id,
      lineId: line.id,
      index: nextTokenIndex,
      displayText: line.text,
      normalized: [...normalizeLyricToken(line.annotation, options)],
      sourceStart: line.sourceStart,
      sourceEnd: line.sourceEnd,
      kind: "annotation",
    });
  }

  return {
    line: {
      schemaVersion: 1,
      id: line.id || `line-${lineIndex + 1}`,
      displayText: line.text,
      ...splitWhitespace(line.text),
      sourceStart: line.sourceStart,
      sourceEnd: line.sourceEnd,
      stanza: line.stanza,
      blank: line.blank,
      ...(line.annotation ? { annotation: line.annotation } : {}),
      timestamps: [...line.timestamps],
      tokenIds,
    },
    tokens,
  };
}

export function createCanonicalLyrics(
  parsed: ParsedLyrics,
  options: NormalizationOptions = {},
): CanonicalLyrics {
  const lines: CanonicalLine[] = [];
  const tokens: CanonicalToken[] = [];
  for (const [lineIndex, parsedLine] of parsed.lines.entries()) {
    const canonical = canonicalizeLine(parsedLine, lineIndex, tokens.length, options);
    lines.push(canonical.line);
    tokens.push(...canonical.tokens);
  }
  return canonicalLyricsSchema.parse({
    schemaVersion: 1,
    format: parsed.format,
    sourceText: parsed.sourceText,
    metadata: [...parsed.metadata],
    lines,
    tokens,
  });
}

export function reconstructCanonicalSource(lyrics: CanonicalLyrics): string {
  return lyrics.sourceText;
}
