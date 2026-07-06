import { AppError } from "../../app/errors/AppError";

export interface LyricMetadata {
  readonly key: string;
  readonly value: string;
}

export interface LyricTimestamp {
  readonly milliseconds: number;
  readonly raw: string;
}

export interface ParsedLyricLine {
  readonly id: string;
  readonly text: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly stanza: number;
  readonly blank: boolean;
  readonly annotation?: string;
  readonly timestamps: readonly LyricTimestamp[];
}

export interface ParsedLyrics {
  readonly format: "txt" | "lrc";
  readonly sourceText: string;
  readonly metadata: readonly LyricMetadata[];
  readonly lines: readonly ParsedLyricLine[];
}

const timestampPattern = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/u;
const metadataPattern = /^\[([a-z][a-z0-9-]*):(.*)\]$/iu;
const annotationPattern = /^\s*\[([^\]:]+)\]\s*$/u;

function parseFraction(value: string | undefined): number {
  if (!value) return 0;
  return Number(value.padEnd(3, "0").slice(0, 3));
}

export function parseLyrics(sourceText: string, hint?: "txt" | "lrc"): ParsedLyrics {
  const format = hint ?? (timestampPattern.test(sourceText.trimStart()) ? "lrc" : "txt");
  const metadata: LyricMetadata[] = [];
  const lines: ParsedLyricLine[] = [];
  let offset = 0;
  let stanza = 0;

  for (const [index, rawWithEnding] of sourceText.split(/(?<=\n)/u).entries()) {
    const raw = rawWithEnding.replace(/\r?\n$/u, "");
    const lineEndingLength = rawWithEnding.length - raw.length;
    let text = raw;
    const timestamps: LyricTimestamp[] = [];

    if (format === "lrc") {
      const metadataMatch = text.match(metadataPattern);
      if (metadataMatch && !/^\d/u.test(metadataMatch[1] ?? "")) {
        metadata.push({
          key: (metadataMatch[1] ?? "").toLocaleLowerCase(),
          value: metadataMatch[2] ?? "",
        });
        offset += raw.length + lineEndingLength;
        continue;
      }
      let match = text.match(timestampPattern);
      while (match) {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const milliseconds = minutes * 60_000 + seconds * 1000 + parseFraction(match[3]);
        timestamps.push({ milliseconds, raw: match[0] });
        text = text.slice(match[0].length);
        match = text.match(timestampPattern);
      }
    }

    const blank = text.length === 0;
    if (blank && lines.length > 0 && !lines.at(-1)?.blank) stanza += 1;
    const annotation = text.match(annotationPattern)?.[1];
    lines.push({
      id: `line-${index + 1}`,
      text,
      sourceStart: offset,
      sourceEnd: offset + raw.length,
      stanza,
      blank,
      ...(annotation ? { annotation } : {}),
      timestamps,
    });
    offset += raw.length + lineEndingLength;
  }

  return { format, sourceText, metadata, lines };
}

export async function readLyricsFile(file: File): Promise<ParsedLyrics> {
  const extension = file.name.toLocaleLowerCase().split(".").at(-1);
  if (extension !== "txt" && extension !== "lrc") {
    throw new AppError("INPUT_INVALID", "Lyrics files must use .txt or .lrc.", {
      technicalDetail: `unsupported lyrics extension ${extension ?? "missing"}`,
      recoveryAction: "Choose a UTF-8 TXT or LRC file.",
    });
  }
  if (file.size === 0) return parseLyrics("", extension);
  if (file.size > 2 * 1024 * 1024) {
    throw new AppError("INPUT_INVALID", "The lyrics file exceeds the 2 MB safety limit.", {
      recoveryAction: "Choose a smaller TXT or LRC file.",
    });
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    return parseLyrics(text.replace(/^\uFEFF/u, ""), extension);
  } catch (cause) {
    throw new AppError("INPUT_INVALID", "The lyrics file is not valid UTF-8 text.", {
      technicalDetail: cause instanceof Error ? cause.message : "UTF-8 decoding failed",
      recoveryAction: "Save the lyrics as UTF-8 and try again.",
      cause,
    });
  }
}
